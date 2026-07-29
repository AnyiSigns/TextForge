from typing import Dict, Any, List, Optional
from agents.agent_state import UserAgentState
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from core.model_factory import ModelFactory
from langchain_core.prompts import ChatPromptTemplate
import json


AGENT_SYSTEM_PROMPT = """你是 TextForge Agent，一位专业的 AI 文学创作助手。
你可以调用工具辅助创作，也可以通过 generate_chapter 发起章节生成任务。"""


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars // 2] + "\n...[截断]...\n" + text[-max_chars // 2 :]


def _compress_context(state: UserAgentState) -> UserAgentState:
    messages = state.get("messages", [])
    if len(messages) <= 20:
        return state
    summary_parts = []
    for msg in messages[:-20]:
        role = getattr(msg, "type", type(msg).__name__)
        content = getattr(msg, "content", "") or ""
        summary_parts.append(f"{role}: {_truncate(content, 400)}")
    compressed = "\n".join(summary_parts)
    state["messages"] = messages[-20:]
    state["step_outputs"] = {**state.get("step_outputs", {}), "compressed_context": compressed}
    return state


async def agent_call(state: UserAgentState) -> Dict[str, Any]:
    state = _compress_context(state)
    llm = ModelFactory(state["model_config"])
    system_prompt = AGENT_SYSTEM_PROMPT
    if state.get("previous_chapter_summary"):
        system_prompt += f"\n\n上一章摘要：{state['previous_chapter_summary']}"
    if state.get("previous_chapter_content"):
        system_prompt += f"\n\n上一章正文（已截断）：{_truncate(state['previous_chapter_content'])}"
    cross_ctx = state.get("cross_chapter_context", {})
    if cross_ctx:
        system_prompt += f"\n\n跨章节上下文：{json.dumps(cross_ctx, ensure_ascii=False)}"
    bound_llm = llm.main.bind_tools([])
    result = await bound_llm.ainvoke([SystemMessage(system_prompt)] + state["messages"])
    return {"messages": [result]}


def agent_router(state: UserAgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tool_calls"
    return END
