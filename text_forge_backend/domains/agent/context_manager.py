from datetime import datetime, timezone
from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
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


def _format_messages_for_summary(messages: list) -> str:
    parts = []
    for msg in messages:
        role = getattr(msg, "type", type(msg).__name__)
        parts.append(f"{role}: {truncate_text(_msg_text(msg), 600)}")
    return "\n".join(parts)


def _should_compress(state: UserAgentState) -> bool:
    """是否应触发上下文压缩：消息数超过保留窗口且 token 估算接近预算。"""
    messages = state.get("messages", [])
    if len(messages) <= COMPRESS_KEEP:
        return False
    return _estimate_tokens(messages) > COMPRESS_TOKEN_BUDGET


async def auto_compress_node(state: UserAgentState, session_factory=None) -> dict[str, Any]:
    messages = state.get("messages", [])
    if len(messages) <= COMPRESS_KEEP:
        return {}

    old_messages = messages[:-COMPRESS_KEEP]
    prior_summary = state.get("compressed_context") or ""
    llm = ModelFactory(state["model_config"])

    # 增量摘要：在已有摘要基础上并入本轮被裁剪的早期消息，
    # 避免每次全量重压、并保留跨轮的长期设定/决策。
    human_content = (
        f"已有摘要：\n{prior_summary}\n\n"
        f"需要并入的新对话（早期消息，将被压缩掉）：\n{_format_messages_for_summary(old_messages)}"
        if prior_summary
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
        result = await llm.main.ainvoke(prompt.format_messages())
        summary = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.error(f"auto_compress 摘要生成失败: {exc}", exc_info=True)
        # 摘要失败不应阻断裁剪：沿用旧摘要，保证对话可继续
        summary = prior_summary

    # 静默归档到 AgentMemory（不展示给用户，也不进面板）
    if summary and session_factory:
        try:
            async with session_factory() as session:
                from domains.memory.repository import AgentMemoryRepository

                await AgentMemoryRepository(session).create(
                    user_id=state.get("user_id", 0),
                    data={
                        "memory_type": "context_summary",
                        "content": summary,
                        "source": "auto_compress",
                        "meta": {
                            "book_id": state.get("active_book_id"),
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

    return {
        "messages": messages[-COMPRESS_KEEP:],
        "compressed_context": summary,
        "message_count_at_compress": len(messages),
    }


def compress_router(state: UserAgentState) -> str:
    return "compress" if _should_compress(state) else "agent"
