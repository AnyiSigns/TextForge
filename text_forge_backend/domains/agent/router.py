import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import openai
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from models.book import Book, Chapter, Volume
from models.conversation import Conversation, Message
from schema.request.common import ChatRequest, CompressRequest, ReviewActionRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client

from .agent_state import UserAgentState
from .graphs.agent_graph import build_user_agent_graph

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


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


async def _load_recent_messages(
    session: AsyncSession, conversation_id: int, limit: int = 10
) -> list[dict]:
    """加载指定对话的最近消息，按时间正序返回。"""
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.create_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    messages = list(result.scalars().all())
    messages.reverse()
    return [
        {"type": "human" if m.role == "user" else "ai", "content": m.content}
        for m in messages
    ]


async def _acquire_book_lock(book_id: int, user_id: int) -> tuple[bool, str]:
    """为书籍获取分布式锁，返回 (是否获取成功, 锁键)。"""
    if not book_id:
        return (True, "")
    try:
        key = f"agent:book_lock:{user_id}:{book_id}:{uuid.uuid4().hex}"
        result = await redis_client.set(
            key, "1", ex=3600, nx=True
        )  # 锁过期时间，3600秒（1小时），防止长时间占锁
        return (result is True, key)
    except Exception as exc:
        logger.error(f"获取书籍锁失败: {exc}")
        return (False, "")


async def _release_book_lock(book_id: int, user_id: int, lock_key: str | None = None):
    """释放先前获取的书籍分布式锁。"""
    if not book_id:
        return
    try:
        if lock_key:
            await redis_client.delete(lock_key)
        else:
            pattern = f"agent:book_lock:{user_id}:{book_id}:*"
            keys = []
            async for key in redis_client.scan_iter(pattern):
                keys.append(key)
            if keys:
                await redis_client.delete(*keys)
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
) -> tuple[Conversation, UserAgentState, int]:
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=message,
    )
    session.add(user_msg)
    await session.commit()

    recent_messages = await _load_recent_messages(session, conversation.id, limit=10)

    book_id = conversation.book_id or 0
    # 前端携带当前书籍时修正会话绑定，避免旧会话 book_id=0 导致「无法访问书籍信息」
    if book_id_override:
        if conversation.book_id != book_id_override:
            conversation.book_id = book_id_override
            await session.commit()
        book_id = book_id_override
    state: UserAgentState = {
        "messages": recent_messages,
        "user_id": user_id,
        "active_book_id": book_id,
        "model_config": model_config,
        "step_outputs": {},
        "previous_chapter_summary": None,
        "previous_chapter_content": None,
        "cross_chapter_context": {},
        "compressed_context": None,
        "message_count_at_compress": None,
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
        "suggestions_signature": None,
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
            state["previous_chapter_summary"] = prev_ctx.get("previous_chapter_summary")
            state["previous_chapter_content"] = prev_ctx.get("previous_chapter_content")
            state["cross_chapter_context"] = prev_ctx.get("cross_chapter_context", {})
        except Exception as exc:
            logger.warning(f"查询上一章上下文失败: {exc}")

    return conversation, state, book_id


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
    locked = False
    book_id = None
    try:
        conversation, state, book_id = await _prepare_agent_state(
            session, user_id, body.thread_id, body.message, model_config, body.book_id
        )
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": body.thread_id}, "recursion_limit": 100}
        try:
            result = await graph.ainvoke(state, config=config)
        except Exception as exc:
            logger.error(f"agent respond 失败: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail="Agent 执行失败")
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
            await _release_book_lock(book_id, user_id, lock_key)


@router.post("/stream/{thread_id}")
async def stream_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str,
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    locked = False
    book_id = None

    async def cleanup():
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key)

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
                    "pending_tool": {**pending_tool, "decision": _tool_decision, "edited_content": state_data.get("edited_content")},
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
                        instruction_parts.append(f"target_chapter_id={chapter_id_for_terminate}")
                    node_outputs = state_data.get("workflow_node_outputs", {})
                    if node_outputs:
                        outputs_text = "\n\n".join([
                            f"[{nid}] {data if isinstance(data, str) else data.get('output', '')[:2000]}"
                            for nid, data in node_outputs.items()
                        ])
                        instruction_parts.append(f"根据以下工作流节点输出生成章节正文：\n\n{outputs_text}")
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
                    }
                elif review_decision == "retry":
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
                }
        else:
            conversation, state, book_id = await _prepare_agent_state(
                session, user_id, thread_id, body.message, model_config, body.book_id
            )
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 20}

        async def event_generator():
            try:
                yield ":\n\n"
                final_reply = ""
                tool_called_this_turn = False
                # 单迭代器：stream_mode=["updates","custom"]，二者按真实执行顺序交错产出，
                # 消除此前「astream(custom) 独立任务 + astream_events 主循环」双通道的
                # 事件竞态与 node_start/node_end 重复推送问题。
                from langchain_core.messages import AIMessage as _AIMsg
                from langchain_core.messages import HumanMessage as _HMsg
                from langchain_core.messages import ToolMessage as _TMsg

                async for mode, data in graph.astream(
                    state, config=config, stream_mode=["updates", "custom"]
                ):
                    if mode == "custom":
                        if not isinstance(data, dict):
                            continue
                        etype = data.get("event")
                        if etype in ("node_start", "node_stream", "node_end", "node_fail"):
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
                        # agent 节点返回 messages 增量：若含 tool_calls 则模型决定调工具
                        if node_name == "agent":
                            msgs = update.get("messages") or []
                            if msgs:
                                last = msgs[-1]
                                if isinstance(last, _AIMsg) and getattr(last, "tool_calls", None):
                                    tool_called_this_turn = True
                                    for _tc in last.tool_calls:
                                        tname = _tc.get("name") if isinstance(_tc, dict) else getattr(_tc, "name", "")
                                        if tname == "generate_chapter":
                                            yield f"data: {json.dumps({'type': 'progress', 'step': 'generate_chapter', 'n': 1, 'total': 4, 'words': 0, 'eta': 0}, ensure_ascii=False)}\n\n"
                                        elif tname == "generate_outline_extension":
                                            yield f"data: {json.dumps({'type': 'extend_outline', 'step': 'extend_outline', 'n': 0, 'total': 1}, ensure_ascii=False)}\n\n"
                                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tname}, ensure_ascii=False)}\n\n"
                        # tool_calls 节点完成：工具执行结束，取 ToolMessage 输出推导业务事件
                        elif node_name == "tool_calls":
                            # 写工具被门控拦截时（gated_tool_node 返回 pending_review），
                            # 必须推送审核卡，否则前端永远收不到 review_card、审批流卡死。
                            if update.get("pending_review"):
                                yield f"data: {json.dumps({'type': 'review_card', **update['pending_review']}, ensure_ascii=False)}\n\n"
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
                                    if isinstance(_parsed, dict):
                                        if _parsed.get("status") == "pending_review":
                                            node_results = _parsed.get("node_results", [])
                                            if node_results:
                                                last = node_results[-1]
                                                qc = last.get("quality_check", {})
                                                yield f"data: {json.dumps({'type': 'review_card', 'node_id': _parsed.get('pending_node_id', ''), 'node_label': _parsed.get('pending_node_label', ''), 'output_preview': last.get('output', '')[:1000], 'reason': qc.get('reason', ''), 'system_prompt': qc.get('system_prompt', '')}, ensure_ascii=False)}\n\n"
                                        if _parsed.get("status") == "completed" and _parsed.get("progress_events"):
                                            for prog in _parsed["progress_events"]:
                                                yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                                # 每个工具执行结束各发一次 tool_end（带工具名），供前端复位工具状态条
                                yield f"data: {json.dumps({'type': 'tool_end', 'tool': m.name}, ensure_ascii=False)}\n\n"
                        # quality_gate 节点：工作流审计若产生 pending_review，推送审核卡
                        elif node_name == "quality_gate":
                            if update.get("pending_review"):
                                yield f"data: {json.dumps({'type': 'review_card', **update['pending_review']}, ensure_ascii=False)}\n\n"
                        # workflow_runner 原生节点：审计拦截产生的 pending_review 也要推送审核卡，
                        # 否则前端只看到「触发审计拦截」文字、审核卡不弹（审批流卡死）。
                        elif node_name == "workflow_runner":
                            if update.get("pending_review"):
                                yield f"data: {json.dumps({'type': 'review_card', **update['pending_review']}, ensure_ascii=False)}\n\n"

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
                            isinstance(last, _AIMsg) and getattr(last, "tool_calls", None)
                        ):
                            last = None
                            for m in reversed(final_messages):
                                if isinstance(m, _TMsg):
                                    continue
                                if isinstance(m, _AIMsg) and getattr(m, "tool_calls", None):
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
                            reply = content if isinstance(content, str) else str(content)
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
                try:
                    from .tools.feedback_tools import _build_feedback_tools

                    suggestion_tools = _build_feedback_tools(
                        db_manager.with_db, model_config=model_config
                    )
                    suggestions = await suggestion_tools["proactive_suggestions"].ainvoke(
                        {"user_id": user_id, "book_id": book_id}
                    )
                    # 建议去重：同一建议组合只在会话内推送一次（按 items 的签名比较），
                    # 避免每次回复都重复推送同样的「情节线停滞/章节缺摘要」建议刷屏。
                    _sig = json.dumps(suggestions, ensure_ascii=False, sort_keys=True) if suggestions else ""
                    _prev_sig = (final_state or {}).get("suggestions_signature") or ""
                    if suggestions and _sig != _prev_sig:
                        yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions}, ensure_ascii=False)}\n\n"
                        try:
                            await graph.aupdate_state(config, values={"suggestions_signature": _sig})
                        except Exception:
                            pass
                except Exception as exc:
                    logger.warning(f"SSE 推送建议失败: {exc}")
                # 先推送 end，让前端立即结束流式（三点脉冲消失、streaming 定型）。
                # 标题生成涉及一次模型调用（可能耗时数秒），放在 end 之后执行，
                # 避免阻塞主回复流结束导致前端长时间显示「正在生成」指示器。
                yield f"data: {json.dumps({'type': 'end', 'reply': reply}, ensure_ascii=False)}\n\n"
                # 首条消息结束后生成会话标题（5-10 字）并直接写入数据库，
                # 随后以 title_update 事件下发（此时流尚未关闭，前端仍会读取）。
                if not is_resume and conversation.title == "新对话":
                    try:
                        generated = await _generate_title(model_config, body.message, reply)
                        if generated:
                            conversation.title = generated
                            await session.commit()
                            yield f"data: {json.dumps({'type': 'title_update', 'thread_id': thread_id, 'title': generated}, ensure_ascii=False)}\n\n"
                    except Exception as exc:
                        logger.warning(f"自动生成会话标题失败: {exc}")

            except openai.APIStatusError as e:
                logger.error(
                    f"stream agent 失败: API [{e.status_code}] "
                    f"request_id={e.response.headers.get('x-request-id', 'N/A')} "
                    f"body={e.body!r}"
                )
                yield f"data: {json.dumps({'type': 'error', 'message': f'模型服务异常 ({e.status_code})'}, ensure_ascii=False)}\n\n"
            except Exception:
                logger.exception("stream agent 失败")
                yield f"data: {json.dumps({'type': 'error', 'message': '服务器内部错误'}, ensure_ascii=False)}\n\n"
            finally:
                await cleanup()

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
        return StreamingResponse(_empty(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    state_data = state_snapshot.get("channel_values", {})
    messages = state_data.get("messages", [])
    if not messages:
        async def _empty():
            yield f"data: {json.dumps({'type': 'compress_done', 'summary': '', 'removed_count': 0, 'remaining_count': 0}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    model_config = state_data.get("model_config", {})
    if not model_config or not model_config.get("main_config"):
        async def _err():
            yield f"data: {json.dumps({'type': 'error', 'message': '未找到模型配置'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

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
            await memory_repo.create(
                user_id=user_id,
                data={
                    "book_id": conversation.book_id,
                    "memory_type": "context_summary",
                    "content": summary,
                    "source": "manual_compress",
                    "meta": {
                        "thread_id": body.thread_id,
                        "compressed_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
            )
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
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )

@router.patch("/state/{thread_id}")
async def patch_state(
    thread_id: str,
    body: dict,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    ALLOWED_STATE_KEYS = {'personal_rag_results', 'active_workflow_id', 'workflow_node_outputs'}
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
