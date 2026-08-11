from datetime import datetime, timezone
from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from fastapi import HTTPException
from models.book import Chapter, Volume
from models.conversation import Conversation, Message
from shared.database import db_manager
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .agent_state import UserAgentState
from .concurrency import _acquire_book_lock, _release_book_lock

logger = get_logger(__name__)


async def _generate_title(model_config: dict, user_msg: str, reply: str) -> str | None:
    """根据首条用户消息与 AI 回复，调用主模型生成 5-10 字的会话标题。

    仅用于会话第一条消息结束后自动命名；生成失败或结果异常时返回 None，
    由调用方保留默认标题，不影响主流程。
    """
    try:
        from core.llm_retry import retry_llm
        from langchain_core.messages import HumanMessage

        model = ModelFactory(model_config).main
        prompt = (
            "请用一句话（5 到 10 个汉字）概括以下用户与 AI 的第一次对话主题，"
            "只输出标题本身，不要引号、标点或任何解释。\n"
            f"用户：{user_msg[:200]}\n"
            f"AI：{reply[:200]}"
        )
        # 任务 10（扩展）：LLM 调用指数退避重试（瞬时故障重试 3 次）
        res = await retry_llm(
            lambda: model.ainvoke([HumanMessage(content=prompt)]),
            desc="generate_title",
        )
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


# 任务 19b：回合结束自动摘要存库的节流阈值（新增消息 ≥ 该值时触发一次 digest）。
AUTO_DIGEST_INTERVAL = 10
# 单次 digest 摘要的输入消息数上限（只取最近 N 条生成，控制 token 成本）。
AUTO_DIGEST_RECENT = 20


async def _auto_digest_if_due(
    final_state: dict | None,
    conversation: Conversation,
    user_id: int,
    thread_id: str,
    graph: Any,
    config: dict,
) -> None:
    """回合结束后按节流阈值生成会话摘要并直写 AgentMemory（source=auto_digest）。

    任务 19b 定案：不走 manage_memory（source 硬编码 agent_self_reflection），
    复用 manual_compress / auto_compress 同款 AgentMemoryRepository 直写路径，
    落点 agent_memories 表，memory_type="context_summary"（与压缩摘要同语义，recall 可命中）。

    摘要生成失败不影响主流程；节流基于 checkpoint 中 last_digest_message_count，
    避免每个回合都调用一次 LLM 烧 token。
    """
    if not final_state:
        return
    messages = final_state.get("messages") or []
    if len(messages) < AUTO_DIGEST_RECENT:
        return
    prev_count = final_state.get("last_digest_message_count") or 0
    if len(messages) - prev_count < AUTO_DIGEST_INTERVAL:
        return
    model_config = final_state.get("model_config") or {}
    if not model_config.get("main_config"):
        return
    try:
        from core.llm_retry import retry_llm
        from langchain_core.messages import HumanMessage, SystemMessage

        from .context_manager import flatten_messages_for_summary

        llm = ModelFactory(model_config)
        # 任务 30（审查修复）：复用 context_manager 的共享展平实现，避免重复造轮子
        combined = flatten_messages_for_summary(messages[-AUTO_DIGEST_RECENT:], 400)
        prompt = (
            "请总结以下最近的对话，保留关键创作决策、用户偏好、剧情设定和重要信息。"
            "这份摘要将作为 Agent 的长期记忆存档：\n\n" + combined[:12000]
        )
        # 任务 10（扩展）：LLM 调用指数退避重试（瞬时故障重试 3 次）
        result = await retry_llm(
            lambda: llm.main.ainvoke(
                [
                    SystemMessage(content="你是专业的对话摘要助手。"),
                    HumanMessage(content=prompt),
                ]
            ),
            desc="auto_digest",
        )
        summary = getattr(result, "content", "") or ""
        if not summary:
            return
        from domains.memory.repository import AgentMemoryRepository

        async with db_manager.session_factory() as session:
            memory_repo = AgentMemoryRepository(session)
            payload = {
                "book_id": conversation.book_id,
                "memory_type": "context_summary",
                "content": summary,
                "source": "auto_digest",
                "meta": {
                    "thread_id": thread_id,
                    "digested_at": datetime.now(timezone.utc).isoformat(),
                    "message_count": len(messages),
                },
            }
            try:
                payload["embedding"] = await llm.embedding.aembed_query(summary[:2000])
            except Exception as exc:
                logger.warning(f"auto_digest 摘要 embedding 生成失败: {exc}")
            await memory_repo.create(user_id=user_id, data=payload)
        await graph.aupdate_state(config, values={"last_digest_message_count": len(messages)})
        logger.info(f"auto_digest: thread={thread_id} 存 {len(summary)} 字摘要")
    except Exception as exc:
        logger.warning(f"auto_digest 摘要生成失败: {exc}")


async def _get_conversation(
    session: AsyncSession, thread_id: str, user_id: int
) -> Conversation | None:
    """根据 thread_id 和 user_id 查找对应的对话记录。"""
    stmt = select(Conversation).where(
        Conversation.thread_id == thread_id, Conversation.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def _strip_api_key_from_checkpoint(graph: Any | None, config: dict | None) -> None:
    """回合后 best-effort 剥离 checkpoint 中 model_config 的 api_key（2.10 P-B）。

    输入时剥离会破坏当回合执行（agent_nodes.build_tools / ModelFactory 运行期读取
    state["model_config"]），因此只在回合结束后清除持久化残留；下一回合/压缩由
    请求体注入完整配置。graph/config 可能未绑定（_prepare_agent_state 抛错路径），
    调用方须传 None 守卫。
    """
    if graph is None or config is None:
        return
    try:
        snap = await graph.aget_state(config)
        cfg = (snap.values if snap else {}).get("model_config") or {}
        if not cfg.get("main_config"):
            return
        stripped = {
            **cfg,
            "main_config": {**cfg.get("main_config", {}), "api_key": ""},
        }
        await graph.aupdate_state(config, {"model_config": stripped})
    except Exception as exc:
        logger.warning(f"[P-B] checkpoint api_key 剥离失败: {exc}")


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
    # N1（2.11）：仅 book_id 为空（None/0）的旧会话才允许补绑；已有书籍归属的会话
    # 不随请求体静默改绑（跨书静默重绑定会让用户以为在书 A 操作实际写书 B）。
    if book_id_override and conversation.book_id in (None, 0):
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
            "resume_from_subgraph": None,
            "domain_context": None,
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
            # 任务 28 指标层：每回合独立计数，新回合清零（__reset__ 让 reducer 覆盖旧值）。
            "turn_metrics": {"__reset__": True},
            "subgraph_steps": {"__reset__": True},
            # 嵌套子图版：子图出口结算报告，回合开始显式清空（sync 节点也会清，双保险）
            "subgraph_report": None,
            # 任务 30（压缩修复）：被压缩裁剪的旧消息 ID，回合开始清空（sync 节点也会清，双保险）
            "removed_message_ids": None,
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
