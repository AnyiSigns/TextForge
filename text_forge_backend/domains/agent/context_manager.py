from datetime import datetime
from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from shared.utils import truncate_text

from .agent_state import UserAgentState

logger = get_logger(__name__)

COMPRESS_THRESHOLD = 20  # 触发上下文压缩的消息阈值，20条足以覆盖典型对话轮次


def _format_messages_for_summary(messages: list) -> str:
    parts = []
    for msg in messages:
        role = getattr(msg, "type", type(msg).__name__)
        content = getattr(msg, "content", "") or ""
        parts.append(f"{role}: {truncate_text(content, 400)}")
    return "\n".join(parts)


async def auto_compress_node(state: UserAgentState) -> dict[str, Any]:
    messages = state.get("messages", [])
    if len(messages) <= COMPRESS_THRESHOLD:
        return {}

    old_messages = messages[:-COMPRESS_THRESHOLD]
    llm = ModelFactory(state["model_config"])

    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content="总结以下对话要点，保留关键决策、用户偏好、重要信息。"),
        HumanMessage(content=_format_messages_for_summary(old_messages)),
    ])
    result = await llm.main.ainvoke(prompt.format_messages())
    summary = result.content if hasattr(result, "content") else str(result)

    logger.info(f"auto_compress: 压缩了 {len(old_messages)} 条消息，保留最近 {COMPRESS_THRESHOLD} 条")

    return {
        "messages": messages[-COMPRESS_THRESHOLD:],
        "compressed_context": summary,
        "message_count_at_compress": len(messages),
        "step_outputs": {
            **state.get("step_outputs", {}),
            "compressed_context": summary,
            "compressed_at": datetime.utcnow().isoformat(),
        },
    }


def compress_router(state: UserAgentState) -> str:
    return "compress" if len(state.get("messages", [])) > COMPRESS_THRESHOLD else "agent"
