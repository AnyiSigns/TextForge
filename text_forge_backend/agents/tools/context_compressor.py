from typing import Dict, Any, List, Optional
from agents.agent_state import UserAgentState
from utils.logger import get_logger

logger = get_logger(__name__)


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars // 2] + "\n...[截断]...\n" + text[-max_chars // 2 :]


def compress_if_needed(state: UserAgentState, max_messages: int = 20) -> UserAgentState:
    messages = state.get("messages", [])
    if len(messages) <= max_messages:
        return state
    summary_parts = []
    for msg in messages[:-max_messages]:
        role = getattr(msg, "type", type(msg).__name__)
        content = getattr(msg, "content", "") or ""
        summary_parts.append(f"{role}: {_truncate(content, 400)}")
    compressed = "\n".join(summary_parts)
    state["messages"] = messages[-max_messages:]
    state["step_outputs"] = {**state.get("step_outputs", {}), "compressed_context": compressed}
    logger.info(f"context_compressor: 压缩了 {len(messages) - max_messages} 条消息")
    return state
