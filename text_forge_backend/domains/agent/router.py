import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import openai
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from config.settings import settings
from core.auth import get_current
from core.errors import classify_agent_error
from core.model_factory import ModelFactory
from models.book import Book, Chapter, Volume
from models.conversation import Conversation, Message
from schema.request.common import ChatRequest, CompressRequest, ReviewActionRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.ratelimit import rate_limit_agent
from shared.redis import redis_client

from .agent_state import UserAgentState
from .graphs.agent_graph import build_user_agent_graph

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])

# 正在进行的流式请求 task 注册表（key=thread_id），供 cancel 接口主动中断。
# 注意：仅对当前进程内的流生效（本地/单进程部署），多 worker 下其他进程的
# 流无法被取消，但前端本地 abort 连接同样会触发服务端清理，属兜底机制。
_stream_tasks: dict[str, asyncio.Task] = {}


async def _generate_title(model_config: dict, user_msg: str, reply: str) -> str | None:
    """根据首条用户消息与 AI 回复，调用主模型生成 5-10 字的会话标题。

    仅用于会话第一条消息结束后自动命名；生成失败或结果异常时返回 None，
    由调用方保留默认标题，不影响主流程。
    """
    try:
        from langchain_core.messages import HumanMessage

        model = ModelFactory(model_config).main
        prompt = (
            "请用一句话（5 到 10 个汉字）概括以下用户与 AI 的第一次对话主题，"
            "只输出标题本身，不要引号、标点或任何解释。\n"
            f"用户：{user_msg[:200]}\n"
            f"AI：{reply[:200]}"
        )
        res = await model.ainvoke([HumanMessage(content=prompt)])
        text = getattr(res, "content", "") or ""
        text = text.strip().strip('"').strip("'").strip()
        text = text.split("\n")[0].strip()
        text = text.replace('"', "").replace("'", "")
        if not text:
            return None
        if len(text) > 10:
            text = text[:10]
        return text
    except Exception as exc:
        logger.warning(f"生成会话标题失败: {exc}")
        return None


async def _get_conversation(
    session: AsyncSession, thread_id: str, user_id: int
) -> Conversation | None:
    """根据 thread_id 和 user_id 查找对应的对话记录。"""
    stmt = select(Conversation).where(
        Conversation.thread_id == thread_id, Conversation.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def _sse_review_card(pending_review: dict) -> str:
    """构造 review_card SSE 事件，output_preview 截断到 1000 字防止撑爆 SSE 通道。

    Args:
        pending_review: state 中的 pending_review 字典。

    Returns:
        SSE data 行字符串。
    """
    payload = dict(pending_review)
    preview = payload.get("output_preview") or ""
    if isinstance(preview, str) and len(preview) > 1000:
        payload["output_preview"] = preview[:1000] + "\n…（已截断）"
    return f"data: {json.dumps({'type': 'review_card', **payload}, ensure_ascii=False)}\n\n"


BOOK_LOCK_TTL = 600  # 锁过期时间，600秒（10分钟）；配合 _renew_book_lock 心跳续期，
# 既能覆盖长任务（工作流多节点可达数十分钟），又保证进程崩溃残留的锁至多占用 10 分钟。
BOOK_LOCK_RENEW_INTERVAL = 120  # 锁心跳续期间隔（秒）


async def _acquire_book_lock(book_id: int, user_id: int) -> tuple[bool, str, str]:
    """为书籍获取分布式锁，返回 (是否获取成功, 锁键, 持有者标识)。

    锁键固定为 ``agent:book_lock:{user_id}:{book_id}``，值写入本次请求的
    持有者标识（holder_id），利用 SET NX 保证同一本书在同一时刻只有
    一个 Agent 会话能持有锁；释放时校验持有者，避免误删他人锁。
    """
    if not book_id:
        return (True, "", "")
    holder_id = uuid.uuid4().hex
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        result = await redis_client.set(key, holder_id, ex=BOOK_LOCK_TTL, nx=True)
        return (result is True, key, holder_id)
    except Exception as exc:
        logger.error(f"获取书籍锁失败: {exc}")
        return (False, "", "")


async def _renew_book_lock(lock_key: str, holder_id: str) -> None:
    """后台心跳任务：周期性刷新书籍锁 TTL，防止长任务执行期间锁过期被他人获取。

    仅当锁值仍为本持有者时才续期（Lua 原子判断），锁已被释放或易主时结束任务。

    Args:
        lock_key: 锁键。
        holder_id: 锁持有者标识。
    """
    while True:
        await asyncio.sleep(BOOK_LOCK_RENEW_INTERVAL)
        try:
            script = (
                "if redis.call('GET', KEYS[1]) == ARGV[1] "
                "then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end"
            )
            await redis_client.eval(script, 1, lock_key, holder_id, BOOK_LOCK_TTL)
        except Exception as exc:
            logger.warning(f"续期书籍锁失败: {exc}")
            break


async def _release_book_lock(
    book_id: int,
    user_id: int,
    lock_key: str | None = None,
    holder_id: str | None = None,
):
    """释放先前获取的书籍分布式锁。

    仅当锁值仍为本请求持有的 holder_id 时才删除（Lua 原子判断），
    防止并发场景下误删另一会话重新获取的锁。
    """
    if not book_id or not lock_key:
        return
    try:
        if holder_id:
            script = (
                "if redis.call('GET', KEYS[1]) == ARGV[1] "
                "then return redis.call('DEL', KEYS[1]) else return 0 end"
            )
            await redis_client.eval(script, 1, lock_key, holder_id)
        else:
            # 兼容旧调用：无持有者信息时仅删除固定锁键（不再扫描模式删除，
            # 避免误删同书籍其他会话的锁）。
            await redis_client.delete(lock_key)
    except Exception as exc:
        logger.error(f"释放书籍锁失败: {exc}")


async def _empty_sse(message: str):
    yield f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps({'type': 'end', 'reply': ''}, ensure_ascii=False)}\n\n"


async def _prepare_agent_state(
    session: AsyncSession,
    user_id: int,
    thread_id: str,
    message: str,
    model_config: dict,
    book_id_override: int | None = None,
) -> tuple[Conversation, UserAgentState, int, str, str]:
    """准备 Agent 回合状态并获取书籍任务锁。

    顺序保证：先解析书籍归属并加锁，成功后才写入用户消息——若锁获取失败
    （书籍正被其他 Agent 任务占用），直接抛出 503 且不落库，避免历史消息中
    残留未被 Agent 处理过的无效用户消息。

    Returns:
        (conversation, state, book_id, lock_key, holder_id)；无书籍绑定时
        lock_key 为空字符串，调用方后续释放锁为 no-op。
    """
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    book_id = conversation.book_id or 0
    # 前端携带当前书籍时修正会话绑定，避免旧会话 book_id=0 导致「无法访问书籍信息」。
    # 必须先校验归属：book_id_override 来自请求体，若不校验，攻击者可将会话绑定到
    # 他人书籍，使 Agent 在他人书籍上执行读写工具（IDOR）。
    if book_id_override:
        from domains.book._owner_check import assert_book_owner

        await assert_book_owner(book_id_override, user_id, session)
        if conversation.book_id != book_id_override:
            conversation.book_id = book_id_override
            await session.commit()
        book_id = book_id_override

    lock_key = ""
    holder_id = ""
    if book_id:
        locked, lock_key, holder_id = await _acquire_book_lock(book_id, user_id)
        if not locked:
            raise HTTPException(
                status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
            )

    try:
        user_msg = Message(
            conversation_id=conversation.id,
            role="user",
            content=message,
        )
        session.add(user_msg)
        await session.commit()

        state: UserAgentState = {
            # 仅传入本条新消息，而非从 DB 重载最近 N 条：LangGraph checkpoint 已持有
            # 完整历史（含工具调用中间消息），若再把 DB 消息作为输入，会被 add_messages
            # reducer 按新 ID 追加，导致历史重复累积、上下文膨胀。
            "messages": [{"type": "human", "content": message}],
            "user_id": user_id,
            "active_book_id": book_id,
            "model_config": model_config,
            "step_outputs": {},
            "previous_chapter_summary": None,
            "previous_chapter_content": None,
            "cross_chapter_context": {},
            "compressed_context": None,
            "active_workflow_id": None,
            "pending_review": None,
            "review_decision": None,
            "edited_content": None,
            "candidate_reply_ready": False,
            "workflow_node_outputs": {},
            "personal_rag_results": None,
            "terminate_chapter_id": None,
            # 一次性状态必须显式重置：LangGraph checkpoint 会保留上一轮写入的
            # workflow_result / pending_workflow / pending_tool，若不在新回合清空，
            # 用户选定候选正文后 write_chapter_content 仍会被「确认回合」守卫拦截
            # （gated_tool_node 见 workflow_result 就拒绝所有工具），导致正文永远落不了库。
            "workflow_result": None,
            "pending_workflow": None,
            "pending_tool": None,
            # 注意：suggestions_signature / message_count_at_compress 不在新回合重置，
            # 缺省 key 时 LangGraph 保留 checkpoint 旧值，跨轮建议去重与压缩计数才能生效；
            # 若此处强制置 None 会覆盖 checkpoint 值，导致去重失效、每轮重复推送建议。
        }

        if book_id:
            try:
                from .chapter_context import get_previous_chapter_context

                latest_chapter_stmt = (
                    select(Chapter)
                    .where(
                        Chapter.volume_id.in_(
                            select(Volume.id).where(Volume.book_id == book_id)
                        )
                    )
                    .order_by(Chapter.created_at.desc())
                    .limit(1)
                )
                latest_chapter_result = await session.execute(latest_chapter_stmt)
                latest_chapter = latest_chapter_result.scalar_one_or_none()
                latest_chapter_id = latest_chapter.id if latest_chapter else 0

                prev_ctx = await get_previous_chapter_context(
                    session, book_id, latest_chapter_id
                )
                state["previous_chapter_summary"] = prev_ctx.get(
                    "previous_chapter_summary"
                )
                state["previous_chapter_content"] = prev_ctx.get(
                    "previous_chapter_content"
                )
                state["cross_chapter_context"] = prev_ctx.get(
                    "cross_chapter_context", {}
                )
            except Exception as exc:
                logger.warning(f"查询上一章上下文失败: {exc}")

        return conversation, state, book_id, lock_key, holder_id
    except Exception:
        # 加锁成功后的任何失败都必须在此释放锁：调用方尚未拿到 lock 信息，
        # 若交由调用方清理，book_id 仍为 None，锁会一直残留到过期。
        await _release_book_lock(book_id, user_id, lock_key, holder_id)
        raise


@router.get("/conversations", response_model=list[HistoryResponse])
async def list_conversations(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    stmt = select(Conversation).where(Conversation.user_id == user_id)
    if book_id is not None:
        stmt = stmt.where(Conversation.book_id == book_id)
    stmt = stmt.order_by(Conversation.update_at.desc())
    result = await session.execute(stmt)
    conversations = result.scalars().all()
    return [HistoryResponse.model_validate(c) for c in conversations]


@router.get("/conversations/{conv_id}/messages", response_model=list[MessagesResponse])
async def list_messages(
    conv_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    conv_stmt = select(Conversation).where(
        Conversation.id == conv_id, Conversation.user_id == user_id
    )
    conv_result = await session.execute(conv_stmt)
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    stmt = (
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.create_at)
    )
    result = await session.execute(stmt)
    messages = result.scalars().all()
    return [MessagesResponse.model_validate(m) for m in messages]


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    from sqlalchemy import delete as sqla_delete

    conv_stmt = select(Conversation).where(
        Conversation.id == conv_id, Conversation.user_id == user_id
    )
    conv_result = await session.execute(conv_stmt)
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    await session.execute(
        sqla_delete(Message).where(Message.conversation_id == conv_id)
    )
    await session.delete(conversation)
    await session.commit()
    return {"ok": True}


@router.get("/book-lock")
async def get_book_lock_status(
    book_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """查询书籍当前是否被 Agent 任务占用（锁状态）。

    Args:
        book_id: 书籍 ID（须为当前用户所有）。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        含 locked / holder / ttl 的字典；查询失败时按未占用处理。
    """
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        ttl = await redis_client.ttl(key)
        holder = await redis_client.get(key)
        return {"locked": ttl is not None and ttl > 0, "holder": holder, "ttl": ttl}
    except Exception as exc:
        logger.error(f"查询书籍锁失败: {exc}")
        return {"locked": False, "holder": None, "ttl": None}


@router.delete("/book-lock")
async def force_release_book_lock(
    book_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """强制释放书籍的 Agent 任务锁（仅限用户自己的书籍）。

    用于锁残留场景（如上一轮任务被中断且未正常清理）。注意：若确有其他
    任务正在执行，强制释放会使其与新任务并发写书，前端需在用户确认无任务
    运行时才调用。

    Args:
        book_id: 书籍 ID（须为当前用户所有）。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        释放结果。
    """
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        await redis_client.delete(key)
        return {"ok": True, "released": True}
    except Exception as exc:
        logger.error(f"强制释放书籍锁失败: {exc}")
        return {"ok": False, "released": False}


@router.post("/start")
async def start_agent_session(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    if book_id is not None:
        stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
        result = await session.execute(stmt)
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    thread_id = str(uuid.uuid4())
    conversation = Conversation(
        user_id=user_id,
        book_id=book_id,
        type="user_agent",
        thread_id=thread_id,
        title="新对话",
    )
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return {"thread_id": thread_id, "book_id": book_id, "type": "user_agent"}


@router.post("/respond")
async def respond_to_agent(
    user_id: Annotated[int, Depends(get_current)],
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    holder_id = None
    book_id = None
    try:
        # 锁在 _prepare_agent_state 内部获取（先加锁后写消息，失败不污染历史）
        conversation, state, book_id, lock_key, holder_id = await _prepare_agent_state(
            session, user_id, body.thread_id, body.message, model_config, body.book_id
        )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": body.thread_id}, "recursion_limit": 100}
        try:
            result = await asyncio.wait_for(
                graph.ainvoke(state, config=config), timeout=settings.LLM_TIMEOUT
            )
        except asyncio.TimeoutError:
            logger.error("agent respond 空闲超时")
            raise HTTPException(status_code=504, detail="生成超时，请稍后重试")
        except Exception as exc:
            app_exc = classify_agent_error(exc)
            logger.error(f"agent respond 失败 (code={app_exc.error_code}): {exc}", exc_info=True)
            raise app_exc
        final_messages = result.get("messages", [])
        ai_message = ""
        from langchain_core.messages import AIMessage, ToolMessage

        for msg in reversed(final_messages):
            if isinstance(msg, ToolMessage):
                continue
            if isinstance(msg, AIMessage) and msg.tool_calls:
                continue
            content = getattr(msg, "content", None)
            if content:
                ai_message = content
                break
        if not ai_message and final_messages:
            ai_message = str(final_messages[-1])
        return {"reply": ai_message, "thread_id": body.thread_id}
    finally:
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key, holder_id)


@router.post("/stream/{thread_id}")
async def stream_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str,
    body: ChatRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
    _rl: None = Depends(rate_limit_agent),
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    holder_id = None
    locked = False
    book_id = None
    _heartbeat_task: asyncio.Task | None = None

    async def cleanup():
        # 幂等：锁已被提前释放（end 事件后）时，Lua 持有者校验会拒绝重复删除；
        # 心跳任务对已完成/已取消任务重复 cancel 无副作用。
        if _heartbeat_task is not None:
            _heartbeat_task.cancel()
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key, holder_id)

    try:
        is_resume = not body.message
        if is_resume:
            conversation = await _get_conversation(session, thread_id, user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="会话不存在")
            book_id = conversation.book_id or 0

            checkpoint = graph_pool_manager.checkpoint
            if not checkpoint:
                raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

            state_snapshot = await checkpoint.aget(
                {"configurable": {"thread_id": thread_id}}
            )
            if not state_snapshot:
                raise HTTPException(status_code=404, detail="未找到会话状态")

            state_data = state_snapshot.get("channel_values", {})
            pending_tool = state_data.get("pending_tool")
            if pending_tool:
                # 被门控拦截的写工具审批：直接交回 tool_calls 节点执行，不重跑 agent
                _tool_decision = state_data.get("review_decision") or "accept"
                state = {
                    **state_data,
                    "pending_tool": {
                        **pending_tool,
                        "decision": _tool_decision,
                        "edited_content": state_data.get("edited_content"),
                    },
                    "pending_review": None,
                    "review_decision": None,
                    "edited_content": None,
                    "candidate_reply_ready": False,
                }
            else:
                pending_review = state_data.get("pending_review")
                if not pending_review:
                    return StreamingResponse(
                        _empty_sse("无待处理的审核，请发送新消息开始对话"),
                        media_type="text/event-stream",
                        headers={"Cache-Control": "no-cache, no-transform"},
                    )
                review_decision = state_data.get("review_decision", "accept")
                edited_content = state_data.get("edited_content", "")
                node_label = pending_review.get("node_label", "")

                from langchain_core.messages import HumanMessage

                messages = list(state_data.get("messages", []))

                if review_decision == "terminate":
                    chapter_id_for_terminate = state_data.get("terminate_chapter_id")
                    instruction_parts = []
                    if chapter_id_for_terminate:
                        instruction_parts.append(
                            f"target_chapter_id={chapter_id_for_terminate}"
                        )
                    node_outputs = state_data.get("workflow_node_outputs", {})
                    if node_outputs:
                        outputs_text = "\n\n".join(
                            [
                                f"[{nid}] {data if isinstance(data, str) else data.get('output', '')[:2000]}"
                                for nid, data in node_outputs.items()
                            ]
                        )
                        instruction_parts.append(
                            f"根据以下工作流节点输出生成章节正文：\n\n{outputs_text}"
                        )
                    messages.append(
                        HumanMessage(
                            content=f"工作流已被用户终止。请根据已完成的节点输出生成最终章节。{' '.join(instruction_parts) if instruction_parts else '请汇总已有输出并给出建议。'}"
                        )
                    )
                    state = {
                        **state_data,
                        "messages": messages,
                        "pending_review": None,
                        "review_decision": None,
                        "edited_content": None,
                        "terminate_chapter_id": None,
                        "active_workflow_id": None,
                        "workflow_node_outputs": {},
                        # 关键：工作流审计拦截时 _finish_with_candidate 会把
                        # candidate_reply_ready 置 True（_entry_router 见之立即 END），
                        # 续跑必须重置为 False，否则用户审核决定永远不会被 agent 处理；
                        # workflow_result 同样必须清空，否则 gated_tool_node 的
                        # 「候选确认回合」守卫会拦截 retry/continue 所需的工具调用。
                        "candidate_reply_ready": False,
                        "workflow_result": None,
                    }
                wf_id = pending_review.get("workflow_id")
                nid = pending_review.get("node_id")
                tcid = pending_review.get("target_chapter_id")
                if wf_id and nid:
                    # 确定性续跑：按待审节点的精确 workflow_id + node_id 重跑，
                    # 不再让 LLM 臆测节点 ID（此前误把审计角色 auditor 当节点导致「节点不存在」）。
                    queued: dict = {"workflow_id": wf_id, "node_id": nid}
                    if tcid is not None:
                        queued["target_chapter_id"] = tcid
                    if review_decision == "accept":
                        # 用户接受当前输出：重跑该节点但跳过自动质量审计，直接作为候选呈现
                        queued["skip_audit"] = True
                        note = f"节点 [{node_label}] 的输出已被用户接受，正在重新执行并继续。"
                    elif review_decision == "edit" and edited_content:
                        # 用户修改后内容：直接作为节点输出，跳过生成与审计
                        queued["forced_output"] = edited_content
                        note = f"节点 [{node_label}] 的输出已被用户修改，正在按修改后内容继续。"
                    else:  # retry：重跑同一节点并重新审计
                        note = f"节点 [{node_label}] 的输出被用户拒绝，正在重新生成。"
                    messages.append(HumanMessage(content=note))
                    state = {
                        **state_data,
                        "messages": messages,
                        "pending_review": None,
                        "review_decision": None,
                        "edited_content": None,
                        # 续跑必须清 candidate_reply_ready 与 workflow_result，
                        # 否则图在 _entry_router 立即 END、审核决定失效。
                        "candidate_reply_ready": False,
                        "workflow_result": None,
                        "pending_workflow": queued,
                    }
                else:
                    # 兜底：缺少 workflow_id/node_id 时退回自然语言续跑（旧行为）
                    if review_decision == "retry":
                        messages.append(
                            HumanMessage(
                                content=f"节点 [{node_label}] 的输出被用户拒绝。请调整参数或从不同的角度重新生成，确保输出严格遵循该节点的写作要求。"
                            )
                        )
                    elif review_decision == "edit" and edited_content:
                        messages.append(
                            HumanMessage(
                                content=f"节点 [{node_label}] 的输出已被用户修改为以下内容：\n\n{edited_content}\n\n请基于此修改后的内容继续工作，并相应调整后续节点的上下文。"
                            )
                        )
                    else:
                        messages.append(
                            HumanMessage(
                                content=f"节点 [{node_label}] 的输出已被用户接受。请继续执行下一个节点。"
                            )
                        )

                    state = {
                        **state_data,
                        "messages": messages,
                        "pending_review": None,
                        "review_decision": None,
                        "edited_content": None,
                        # 同 terminate 分支：审计拦截续跑必须清 candidate_reply_ready 与
                        # workflow_result，否则图在 _entry_router 立即 END、审核决定失效。
                        "candidate_reply_ready": False,
                        "workflow_result": None,
                    }
        else:
            # 锁在 _prepare_agent_state 内部获取（先加锁后写消息，失败不污染历史）
            conversation, state, book_id, lock_key, holder_id = (
                await _prepare_agent_state(
                    session,
                    user_id,
                    thread_id,
                    body.message,
                    model_config,
                    body.book_id,
                )
            )
        if book_id and not lock_key:
            # resume 分支未经 _prepare_agent_state，需自行获取书籍锁
            locked, lock_key, holder_id = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        if lock_key:
            # 长任务（工作流多节点可达数十分钟）期间周期续期锁 TTL，防止执行中锁过期被他人获取
            _heartbeat_task = asyncio.create_task(_renew_book_lock(lock_key, holder_id))
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 100}

        async def event_generator():
            _ag_iter = None
            try:
                yield ":\n\n"
                final_reply = ""
                tool_called_this_turn = False
                # 任务 32：收集本回合推送的审核卡，回合结束统一落库为卡片消息，
                # 使历史会话能还原审核卡（Message 表新增 type/token 列）
                _card_payloads: list[dict] = []
                # 单迭代器：stream_mode=["updates","custom"]，二者按真实执行顺序交错产出，
                # 消除此前「astream(custom) 独立任务 + astream_events 主循环」双通道的
                # 事件竞态与 node_start/node_end 重复推送问题。
                from langchain_core.messages import AIMessage as _AIMsg
                from langchain_core.messages import HumanMessage as _HMsg
                from langchain_core.messages import ToolMessage as _TMsg

                _ag_iter = graph.astream(
                    state, config=config, stream_mode=["updates", "custom"]
                ).__aiter__()
                _idle_timeout = settings.LLM_TIMEOUT
                while True:
                    try:
                        _step = await asyncio.wait_for(
                            _ag_iter.__anext__(), timeout=_idle_timeout
                        )
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError:
                        logger.error("Agent 流式空闲超时，主动终止回合")
                        yield f"data: {json.dumps({'type': 'error', 'message': '生成超时，请稍后重试'}, ensure_ascii=False)}\n\n"
                        break
                    mode, data = _step
                    # 客户端断连：尽快终止并释放书籍锁，避免空占锁到 TTL
                    if await request.is_disconnected():
                        logger.info("客户端已断开，终止 Agent 流式")
                        break
                    if mode == "custom":
                        if not isinstance(data, dict):
                            continue
                        etype = data.get("event")
                        if etype in (
                            "node_start",
                            "node_stream",
                            "node_end",
                            "node_fail",
                            "subgraph_start",
                        ):
                            yield f"data: {json.dumps({'type': etype, **data}, ensure_ascii=False)}\n\n"
                        elif etype == "think_start":
                            yield f"data: {json.dumps({'type': 'think_start', 'elapsed': 0, 'user_id': user_id}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_think_end":
                            yield f"data: {json.dumps({'type': 'agent_think_end'}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_reasoning":
                            # 思考内容：前端仅用于状态指示，不强依赖其文本
                            yield f"data: {json.dumps({'type': 'agent_reasoning', 'token': data.get('token', '')}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_token":
                            token = data.get("token", "")
                            if token:
                                final_reply += token
                                yield f"data: {json.dumps({'type': 'agent_token', 'token': token}, ensure_ascii=False)}\n\n"
                        continue

                    # ── updates 模式：每完成一个节点产出 {节点名: state 增量} ──
                    if not isinstance(data, dict):
                        continue
                    for node_name, update in data.items():
                        if not isinstance(update, dict):
                            continue
                        # agent/子图节点返回 messages 增量：若含 tool_calls 则模型决定调工具
                        if node_name in ("agent", "worldbuilding", "outlining", "drafting", "revising"):
                            msgs = update.get("messages") or []
                            if msgs:
                                last = msgs[-1]
                                if isinstance(last, _AIMsg) and getattr(
                                    last, "tool_calls", None
                                ):
                                    # 任务 14：按本轮 generate_chapter 调用次数给出真实 N/M 进度
                                    # （单章生成的真实进度仍由 progress_events 透传）
                                    _gcs = [
                                        t for t in last.tool_calls
                                        if (t.get("name") if isinstance(t, dict) else getattr(t, "name", "")) == "generate_chapter"
                                    ]
                                    _gc_total = max(len(_gcs), 1)
                                    _gc_n = 0
                                    for _gi, _tc in enumerate(last.tool_calls):
                                        tname = (
                                            _tc.get("name")
                                            if isinstance(_tc, dict)
                                            else getattr(_tc, "name", "")
                                        )
                                        if tname == "generate_chapter":
                                            _gc_n += 1
                                            yield f"data: {json.dumps({'type': 'progress', 'step': 'generate_chapter', 'n': _gc_n, 'total': _gc_total, 'words': 0, 'eta': 0}, ensure_ascii=False)}\n\n"
                                        elif tname == "generate_outline_extension":
                                            yield f"data: {json.dumps({'type': 'extend_outline', 'step': 'extend_outline', 'n': 0, 'total': 1}, ensure_ascii=False)}\n\n"
                                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tname}, ensure_ascii=False)}\n\n"
                        # tool_calls 节点完成：工具执行结束，取 ToolMessage 输出推导业务事件
                        elif node_name == "tool_calls":
                            # 写工具被门控拦截时（gated_tool_node 返回 pending_review），
                            # 必须推送审核卡，否则前端永远收不到 review_card、审批流卡死。
                            if update.get("pending_review"):
                                _card_payloads.append(update["pending_review"])
                                yield _sse_review_card(update["pending_review"])
                            msgs = update.get("messages") or []
                            for m in msgs:
                                if not isinstance(m, _TMsg):
                                    continue
                                _out = m.content
                                if isinstance(_out, dict):
                                    _out = json.dumps(_out, ensure_ascii=False)
                                if isinstance(_out, str) and _out.startswith("{"):
                                    try:
                                        _parsed = json.loads(_out)
                                    except Exception:
                                        _parsed = None
                                    if isinstance(_parsed, dict) and _parsed.get(
                                        "status"
                                    ) == "completed" and _parsed.get("progress_events"):
                                        for prog in _parsed["progress_events"]:
                                            yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                                # 每个工具执行结束各发一次 tool_end（带工具名），供前端复位工具状态条
                                yield f"data: {json.dumps({'type': 'tool_end', 'tool': m.name}, ensure_ascii=False)}\n\n"
                        # quality_gate 节点：工作流审计若产生 pending_review，推送审核卡
                        elif (
                            node_name == "quality_gate"
                            or node_name == "workflow_runner"
                        ):
                            if update.get("pending_review"):
                                _card_payloads.append(update["pending_review"])
                                yield _sse_review_card(update["pending_review"])

                # ── 图执行结束：从 checkpointer 读取最终 state，提取最终回复 ──
                reply = ""
                try:
                    snap = await graph.aget_state(config)
                    final_state = snap.values if snap else {}
                    final_messages = final_state.get("messages", [])
                    logger.info(
                        f"[stream_agent] 图结束: candidate_reply_ready={final_state.get('candidate_reply_ready')} "
                        f"messages_len={len(final_messages)} 最后消息类型={type(final_messages[-1]).__name__ if final_messages else 'none'}"
                    )
                    if final_messages:
                        last = final_messages[-1]
                        if isinstance(last, _TMsg) or (
                            isinstance(last, _AIMsg)
                            and getattr(last, "tool_calls", None)
                        ):
                            last = None
                            for m in reversed(final_messages):
                                if isinstance(m, _TMsg):
                                    continue
                                if isinstance(m, _AIMsg) and getattr(
                                    m, "tool_calls", None
                                ):
                                    continue
                                # 只回退到 AI 消息；跳过用户消息，避免「AI 把用户问题原样复读」
                                if isinstance(m, _HMsg):
                                    continue
                                content = getattr(m, "content", None)
                                if content:
                                    last = m
                                    break
                        if last is not None:
                            content = getattr(last, "content", None) or ""
                            reply = (
                                content if isinstance(content, str) else str(content)
                            )
                except Exception as exc:
                    logger.warning(f"读取最终回复失败: {exc}")
                if not reply:
                    reply = final_reply

                if reply:
                    ai_msg = Message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=reply,
                    )
                    session.add(ai_msg)
                    await session.commit()
                # 任务 32：审核卡落库为卡片消息（历史会话可还原）
                if _card_payloads:
                    try:
                        for _card in _card_payloads:
                            session.add(
                                Message(
                                    conversation_id=conversation.id,
                                    role="assistant",
                                    content="",
                                    type="review-card",
                                    token=json.dumps(_card, ensure_ascii=False),
                                )
                            )
                        await session.commit()
                    except Exception as exc:
                        logger.warning(f"审核卡消息落库失败: {exc}")
                try:
                    from .tools.feedback_tools import _build_feedback_tools

                    suggestion_tools = _build_feedback_tools(
                        db_manager.with_db, model_config=model_config
                    )
                    suggestions = await suggestion_tools[
                        "proactive_suggestions"
                    ].ainvoke({"user_id": user_id, "book_id": book_id})
                    # 建议去重：同一建议组合只在会话内推送一次（按 items 的签名比较），
                    # 避免每次回复都重复推送同样的「情节线停滞/章节缺摘要」建议刷屏。
                    _sig = (
                        json.dumps(suggestions, ensure_ascii=False, sort_keys=True)
                        if suggestions
                        else ""
                    )
                    _prev_sig = (final_state or {}).get("suggestions_signature") or ""
                    if suggestions and _sig != _prev_sig:
                        yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions}, ensure_ascii=False)}\n\n"
                        try:
                            await graph.aupdate_state(
                                config, values={"suggestions_signature": _sig}
                            )
                        except Exception:
                            pass
                except Exception as exc:
                    logger.warning(f"SSE 推送建议失败: {exc}")
                # 先推送 end，让前端立即结束流式（三点脉冲消失、streaming 定型）。
                # 标题生成涉及一次模型调用（可能耗时数秒），放在 end 之后执行，
                # 避免阻塞主回复流结束导致前端长时间显示「正在生成」指示器。
                yield f"data: {json.dumps({'type': 'end', 'reply': reply}, ensure_ascii=False)}\n\n"
                # 提前释放书籍锁：前端收到 end 即恢复可发送状态，若锁拖到标题生成
                # （一次完整 LLM 调用，耗时数秒）结束后才释放，用户在该窗口内的
                # 新消息会被 503 拒绝。此处释放后 finally 中的 cleanup 幂等（Lua
                # 持有者校验 + 心跳任务 cancel 无副作用），重复调用安全。
                await cleanup()
                # 首条消息结束后生成会话标题（5-10 字）并直接写入数据库，
                # 随后以 title_update 事件下发（此时流尚未关闭，前端仍会读取）。
                if not is_resume and conversation.title == "新对话":
                    try:
                        generated = await _generate_title(
                            model_config, body.message, reply
                        )
                        if generated:
                            conversation.title = generated
                            await session.commit()
                            yield f"data: {json.dumps({'type': 'title_update', 'thread_id': thread_id, 'title': generated}, ensure_ascii=False)}\n\n"
                    except Exception as exc:
                        logger.warning(f"自动生成会话标题失败: {exc}")

            except Exception as e:
                app_exc = classify_agent_error(e)
                logger.error(f"stream agent 失败 (code={app_exc.error_code}): {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': app_exc.detail}, ensure_ascii=False)}\n\n"
            finally:
                # 关闭底层图迭代器，避免空闲超时/断连 break 后生成器残留
                if _ag_iter is not None:
                    try:
                        await _ag_iter.aclose()
                    except Exception:
                        pass
                _stream_tasks.pop(thread_id, None)
                await cleanup()

        _current_task = asyncio.current_task()
        if _current_task is not None:
            _stream_tasks[thread_id] = _current_task
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception:
        await cleanup()
        raise


@router.post("/stream/{thread_id}/cancel")
async def cancel_stream(
    thread_id: str,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """主动取消当前进程内正在执行的 Agent 流式任务。

    取消请求处理 task 会使 event_generator 在挂起点收到 CancelledError，
    finally 清理随即执行（释放书籍锁、移除任务注册）。用于前端「停止」按钮
    的兜底：即使浏览器连接断开未被服务端及时感知，也能尽快终止任务。

    Args:
        thread_id: 会话 ID。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        是否找到并取消了任务。
    """
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    task = _stream_tasks.get(thread_id)
    if task and not task.done():
        task.cancel()
        # 清理 checkpoint 中的 pending 三件套：abort 后若用户 resume（无消息续跑），
        # 不会继续执行被拦截的写工具（计划任务 11）。新消息路径已由
        # _prepare_agent_state 一次性重置，二者不冲突。
        try:
            checkpoint = graph_pool_manager.checkpoint
            if checkpoint:
                _config = {"configurable": {"thread_id": thread_id}}
                await checkpoint.aupdate_state(
                    _config,
                    values={
                        "pending_tool": None,
                        "pending_review": None,
                        "pending_workflow": None,
                    },
                )
        except Exception as exc:
            logger.warning(f"[cancel_stream] 清理 pending 状态失败: {exc}")
        return {"ok": True}
    return {"ok": False}


@router.post("/compress")
async def manual_compress(
    user_id: Annotated[int, Depends(get_current)],
    body: CompressRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    conversation = await _get_conversation(session, body.thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    config = {"configurable": {"thread_id": body.thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:

        async def _empty():
            yield f"data: {json.dumps({'type': 'compress_done', 'summary': '', 'removed_count': 0, 'remaining_count': 0}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            _empty(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    state_data = state_snapshot.get("channel_values", {})
    messages = state_data.get("messages", [])
    if not messages:

        async def _empty():
            yield f"data: {json.dumps({'type': 'compress_done', 'summary': '', 'removed_count': 0, 'remaining_count': 0}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            _empty(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    model_config = state_data.get("model_config", {})
    if not model_config or not model_config.get("main_config"):

        async def _err():
            yield f"data: {json.dumps({'type': 'error', 'message': '未找到模型配置'}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            _err(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    llm = ModelFactory(model_config)
    from langchain_core.messages import HumanMessage, SystemMessage

    parts = []
    for msg in messages:
        role = getattr(msg, "type", type(msg).__name__)
        content = getattr(msg, "content", "") or ""
        parts.append(f"{role}: {content[:400]}")
    combined = "\n".join(parts)

    prompt = (
        f"请详细总结以下对话，保留所有关键决策、用户偏好、创作设定和重要信息。"
        f"这份摘要将替代历史消息成为 Agent 的长期记忆：\n\n{combined[:12000]}"
    )

    async def event_generator():
        summary = ""
        try:
            async for chunk in llm.main.astream(
                [
                    SystemMessage(content="你是专业的对话摘要助手。"),
                    HumanMessage(content=prompt),
                ]
            ):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if text:
                    summary += text
                    yield f"data: {json.dumps({'type': 'token', 'token': text}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.error(f"manual_compress LLM 调用失败: {exc}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': '摘要生成失败'}, ensure_ascii=False)}\n\n"
            return

        try:
            from domains.memory.repository import AgentMemoryRepository

            memory_repo = AgentMemoryRepository(session)
            memory_payload = {
                "book_id": conversation.book_id,
                "memory_type": "context_summary",
                "content": summary,
                "source": "manual_compress",
                "meta": {
                    "thread_id": body.thread_id,
                    "compressed_at": datetime.now(timezone.utc).isoformat(),
                },
            }
            # 摘要同步生成向量嵌入，保证语义检索可命中压缩摘要
            try:
                memory_payload["embedding"] = await llm.embedding.aembed_query(
                    summary[:2000]
                )
            except Exception as exc:
                logger.warning(f"压缩摘要 embedding 生成失败: {exc}")
            await memory_repo.create(user_id=user_id, data=memory_payload)
        except Exception as exc:
            logger.warning(f"保存压缩摘要到 AgentMemory 失败: {exc}")

        kept_messages = messages[-20:]
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=checkpoint,
        )
        await graph.aupdate_state(
            config,
            values={
                "messages": kept_messages,
                "compressed_context": summary,
                "message_count_at_compress": len(messages),
            },
        )

        removed_count = len(messages) - len(kept_messages)
        yield f"data: {json.dumps({'type': 'compress_done', 'summary': summary, 'removed_count': removed_count, 'remaining_count': len(kept_messages)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch("/state/{thread_id}")
async def patch_state(
    thread_id: str,
    body: dict,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    # 先校验会话归属：thread_id 来自路径，若不校验可越权读写他人会话的 checkpoint 状态
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    ALLOWED_STATE_KEYS = {
        "personal_rag_results",
        "active_workflow_id",
        "workflow_node_outputs",
    }
    filtered = {k: v for k, v in body.items() if k in ALLOWED_STATE_KEYS}

    config = {"configurable": {"thread_id": thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:
        raise HTTPException(status_code=404, detail="未找到会话状态")

    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config={},
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(config, values=filtered)
    return {"status": "ok", "thread_id": thread_id}


@router.post("/review-action")
async def review_action(
    user_id: Annotated[int, Depends(get_current)],
    body: ReviewActionRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    conversation = await _get_conversation(session, body.thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    config = {"configurable": {"thread_id": body.thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:
        raise HTTPException(status_code=404, detail="未找到会话状态")

    state_data = state_snapshot.get("channel_values", {})
    review_values: dict = {"review_decision": body.action}
    if body.action == "edit" and body.edited_content is not None:
        review_values["edited_content"] = body.edited_content
    if body.action == "terminate":
        review_values["active_workflow_id"] = None
        if body.chapter_id is not None:
            review_values["terminate_chapter_id"] = body.chapter_id

    model_config = state_data.get("model_config", {})
    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config=model_config,
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(config, values=review_values)
    return {"status": "ok", "action": body.action}
