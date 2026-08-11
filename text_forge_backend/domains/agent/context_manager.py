from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, RemoveMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from config.logging import get_logger
from core.model_factory import ModelFactory
from shared.utils import truncate_text

from .agent_state import UserAgentState

logger = get_logger(__name__)

COMPRESS_KEEP = 20                 # 压缩后保留的最近消息条数
COMPRESS_TOKEN_BUDGET = 16000     # 触发压缩的 token 预算（远超正常短对话，避免误触发）
_CHARS_PER_TOKEN = 1.6            # 中英文混合的粗略字符/token 估算系数


def _msg_text(msg) -> str:
    content = getattr(msg, "content", "") or ""
    if isinstance(content, list):  # 多模态 content parts
        content = " ".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    return str(content)


def _estimate_tokens(messages: list) -> int:
    total = 0
    for m in messages:
        total += max(1, len(_msg_text(m)) / _CHARS_PER_TOKEN)
    return int(total)


def flatten_messages_for_summary(messages: list, per_line_chars: int = 600) -> str:
    """把消息列表展平为「role: content」文本，供摘要 LLM 消费。

    任务 30（审查修复）：router 的 auto_digest / manual_compress 与压缩节点各自
    重复实现了 role+content 展平（含多模态 content 分支），此处提供共享实现，
    三处统一调用，避免截断策略漂移。
    """
    parts = []
    for msg in messages:
        role = getattr(msg, "type", type(msg).__name__)
        parts.append(f"{role}: {truncate_text(_msg_text(msg), per_line_chars)}")
    return "\n".join(parts)


def _format_messages_for_summary(messages: list) -> str:
    return flatten_messages_for_summary(messages, 600)


def _should_compress(state: UserAgentState) -> bool:
    """是否应触发上下文压缩：消息数超过保留窗口且 token 估算接近预算。"""
    messages = state.get("messages", [])
    if len(messages) <= COMPRESS_KEEP:
        return False
    return _estimate_tokens(messages) > COMPRESS_TOKEN_BUDGET


def safe_compress_cutoff(messages: list, keep: int) -> int:
    """计算安全的压缩裁剪边界，避免位置切片拆散 tool_call/响应配对。

    直接取 messages[-keep:] 时，若边界恰好落在某次工具调用的 AI 消息与其
    ToolMessage 响应之间，保留区会出现「孤儿 ToolMessage」（其 tool_call_id
    在保留区找不到对应 AI 消息的 tool_call），OpenAI 兼容端点会因此报
    'tool response without a tool call' 之类错误。此函数把边界向后推进，
    把这类孤儿 ToolMessage 一并划入裁剪区。

    Args:
        messages: 完整消息列表。
        keep: 期望保留的最近消息条数。

    Returns:
        安全的裁剪边界（保留 messages[cutoff:]）。
    """
    n = len(messages)
    cutoff = max(0, n - keep)
    if cutoff <= 0 or cutoff >= n:
        return cutoff
    removed_call_ids = set()
    for m in messages[:cutoff]:
        if getattr(m, "type", "") == "ai":
            for tc in getattr(m, "tool_calls", []) or []:
                if tc.get("id"):
                    removed_call_ids.add(tc["id"])
    while cutoff < n:
        m = messages[cutoff]
        if (
            getattr(m, "type", "") == "tool"
            and getattr(m, "tool_call_id", None) in removed_call_ids
        ):
            cutoff += 1
        else:
            break
    return cutoff


async def _book_outline_brief(session, book_id: int | None) -> str:
    """构造压缩摘要中的「书上下文 + 大纲」节（从 DB 取最新快照，每次压缩重建，不会累积膨胀）。

    计划任务 12：compressed_context 结构 = 书上下文 + 大纲 + 最近 N 轮对话摘要。
    """
    if not book_id:
        return ""
    try:
        from sqlalchemy import select

        from models.book import Book, Chapter, CreativeSetting, Volume

        book = (
            await session.execute(select(Book).where(Book.id == book_id))
        ).scalar_one_or_none()
        if not book:
            return ""
        lines = [
            f"书名：{book.title or ''}",
            f"简介：{(book.description or '')[:200]}",
            f"分类：{book.genre or ''}",
        ]
        creative = (
            await session.execute(
                select(CreativeSetting).where(CreativeSetting.book_id == book_id)
            )
        ).scalar_one_or_none()
        if creative:
            if creative.tone:
                lines.append(f"文风：{(creative.tone or '')[:100]}")
            if creative.worldview:
                lines.append(f"世界观：{(creative.worldview or '')[:100]}")
            if creative.writing_taboos:
                lines.append(f"写作禁忌：{(creative.writing_taboos or '')[:100]}")
        vols = (
            (
                await session.execute(
                    select(Volume)
                    .where(Volume.book_id == book_id)
                    .order_by(Volume.sort_order, Volume.id)
                )
            )
            .scalars()
            .all()
        )
        if vols:
            lines.append("大纲：")
            for v in vols:
                chs = (
                    (
                        await session.execute(
                            select(Chapter)
                            .where(Chapter.volume_id == v.id)
                            .order_by(Chapter.sort_order, Chapter.id)
                        )
                    )
                    .scalars()
                    .all()
                )
                ch_titles = [f"{c.sort_order}.{c.title}" for c in chs]
                lines.append(f"  《{v.title}》：{'、'.join(ch_titles[:20])}")
        return "\n".join(lines)[:2000]
    except Exception as exc:
        logger.warning(f"auto_compress 书上下文快照失败: {exc}")
        return ""


def _conversation_part(text: str) -> str:
    """取压缩上下文中「对话摘要」分段之后的纯摘要（失败路径/下一轮输入复用）。

    compressed_context = 【书籍上下文】+【对话摘要】+summary，上一轮的 book 快照
    是随机的旧值，不能作为「已有摘要」再喂给模型（否则新旧大纲并存且失败时逐层嵌套），
    只回取摘要部分。
    """
    marker = "【对话摘要】\n"
    idx = text.rfind(marker)
    return text[idx + len(marker):] if idx != -1 else text


async def auto_compress_node(state: UserAgentState, session_factory=None) -> dict[str, Any]:
    messages = state.get("messages", [])
    if len(messages) <= COMPRESS_KEEP:
        return {}

    old_messages = messages[: safe_compress_cutoff(messages, COMPRESS_KEEP)]
    prior_summary = state.get("compressed_context") or ""
    book_id = state.get("active_book_id", 0) or 0
    llm = ModelFactory(state["model_config"])

    # 任务 12：书上下文 + 大纲快照（每次重建，随摘要一起进入压缩上下文）
    book_brief = ""
    if session_factory:
        try:
            async with session_factory() as session:
                book_brief = await _book_outline_brief(session, book_id)
        except Exception as exc:
            logger.warning(f"auto_compress 书上下文读取失败: {exc}")

    # 增量摘要：在已有「对话摘要」基础上并入本轮被裁剪的早期消息。
    # 已有摘要只取摘要段（不带旧 book 快照），避免新旧大纲并存；book_brief 是
    # 本次重建的新快照，交给模型保持创作设定一致，但仍由下方结构化前缀重附。
    human_content = (
        f"书籍上下文与大纲：\n{book_brief}\n\n"
        f"已有摘要：\n{_conversation_part(prior_summary)}\n\n"
        f"需要并入的新对话（早期消息，将被压缩掉）：\n{_format_messages_for_summary(old_messages)}"
        if (book_brief or prior_summary)
        else _format_messages_for_summary(old_messages)
    )
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(
            content=(
                "你是专业的对话摘要助手。请在已有摘要基础上并入新的对话要点，"
                "输出一份更新的、连贯的压缩摘要，保留关键决策、用户偏好、创作设定和重要信息。"
                "只输出摘要本身，不要其他内容。"
            )
        ),
        HumanMessage(content=human_content),
    ])
    try:
        from core.llm_retry import retry_llm

        # 任务 10（扩展）：LLM 调用指数退避重试（瞬时故障重试 3 次）
        result = await retry_llm(
            lambda: llm.main.ainvoke(prompt.format_messages()),
            desc="auto_compress",
        )
        summary = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.error(f"auto_compress 摘要生成失败: {exc}", exc_info=True)
        # 摘要失败不应阻断裁剪：沿用旧摘要，保证对话可继续
        summary = prior_summary

    # 任务 12：压缩上下文 = 书上下文 + 大纲 + 对话摘要（结构化分段，子图切换时 agent_call 统一注入）。
    # 失败路径 summary == prior_summary（已含前缀），直接沿用不再二次嵌套；
    # 首次失败（prior 为空）至少保留书上下文快照，保证模型不丢创作设定。
    if book_brief:
        if summary and summary != prior_summary:
            compressed_context = f"【书籍上下文】\n{book_brief}\n\n【对话摘要】\n{summary}"
        elif summary:
            compressed_context = summary
        else:
            compressed_context = f"【书籍上下文】\n{book_brief}"
    else:
        compressed_context = summary

    # 静默归档到 AgentMemory（不展示给用户，也不进面板）
    if summary and session_factory:
        try:
            async with session_factory() as session:
                from domains.memory.repository import AgentMemoryRepository

                await AgentMemoryRepository(session).create(
                    user_id=state.get("user_id", 0),
                    data={
                        "book_id": state.get("active_book_id"),
                        "memory_type": "context_summary",
                        "content": summary,
                        "source": "auto_compress",
                        "meta": {
                            "compressed_at": datetime.now(timezone.utc).isoformat(),
                            "trimmed_count": len(old_messages),
                        },
                    },
                )
        except Exception as exc:
            logger.warning(f"自动压缩摘要写入 AgentMemory 失败: {exc}")

    logger.info(
        f"auto_compress: 压缩了 {len(old_messages)} 条消息，保留最近 {COMPRESS_KEEP} 条"
    )

    # 任务 30（压缩修复）：add_messages 只增不减，直接返回 messages[-K:] 无法真正裁剪；
    # 必须返回 RemoveMessage 列表，消息通道才会删除被裁掉的旧消息。
    # 同时把被删 ID 写入 removed_message_ids，由子图输出回流父层，
    # 父层 sync 节点再应用到父层 messages 通道（跨回合真正裁剪）。
    removed_ids = [m.id for m in old_messages if getattr(m, "id", None)]

    return {
        "messages": [RemoveMessage(id=mid) for mid in removed_ids],
        "removed_message_ids": removed_ids,
        "compressed_context": compressed_context,
        "message_count_at_compress": len(messages),
        # 任务 28 指标层：压缩次数计数
        "turn_metrics": {"compress_count": 1},
    }
