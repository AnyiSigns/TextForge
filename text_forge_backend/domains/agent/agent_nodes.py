import json
from typing import Any

from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END
from shared.utils import truncate_text

from .agent_state import UserAgentState

AGENT_SYSTEM_PROMPT = """你是 TextForge Agent，一位专业的 AI 文学创作助手。
你可以通过调用 execute_workflow_node 执行工作流节点来生成内容，也可以使用其他工具进行人物管理、大纲编排、RAG 检索等操作。"""


async def agent_call(state: UserAgentState) -> dict[str, Any]:
    llm = ModelFactory(state["model_config"])
    system_prompt = AGENT_SYSTEM_PROMPT

    compressed = state.get("compressed_context")
    if compressed:
        system_prompt += f"\n\n历史对话压缩摘要：{truncate_text(compressed)}"

    if state.get("previous_chapter_summary"):
        system_prompt += f"\n\n上一章摘要：{state['previous_chapter_summary']}"
    if state.get("previous_chapter_content"):
        system_prompt += (
            f"\n\n上一章正文（已截断）：{truncate_text(state['previous_chapter_content'])}"
        )
    cross_ctx = state.get("cross_chapter_context", {})
    if cross_ctx:
        system_prompt += (
            f"\n\n跨章节上下文：{json.dumps(cross_ctx, ensure_ascii=False)}"
        )
    tools = _resolve_agent_tools(state)
    bound_llm = llm.main.bind_tools(tools) if tools else llm.main
    result = await bound_llm.ainvoke([SystemMessage(system_prompt)] + state["messages"])
    return {"messages": [result]}


def _resolve_agent_tools(state: UserAgentState) -> list[BaseTool]:
    model_config = state.get("model_config") or {}
    if not model_config:
        return []
    from shared.database import db_manager

    from .tools_domain import _build_agent_tools as _domain_build_tools
    return _domain_build_tools(db_manager.session_factory, model_config=model_config)


def agent_router(state: UserAgentState) -> str:
    """Agent 路由函数。

    Args:
        state: Agent 状态。

    Returns:
        下一节点名称或 END。
    """
    pending_review = state.get("pending_review")
    if pending_review:
        return END

    messages = state.get("messages", [])
    if not messages:
        return END

    last = messages[-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tool_calls"
    return END


def quality_gate_router(state: UserAgentState) -> str:
    """工具执行后路由：检查是否需要质量审核。

    Args:
        state: Agent 状态。

    Returns:
        compress（继续）或 END（触发审核中断）。
    """
    pending_review = state.get("pending_review")
    if pending_review:
        return END
    return "compress"


async def quality_gate_node(state: UserAgentState) -> dict[str, Any]:
    """工具执行后质量门：检查 execute_workflow_node 输出是否需要用户审核。"""
    messages = state.get("messages", [])

    last_tool_call = None
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            last_tool_call = msg
            break

    if not last_tool_call:
        return {}

    tool_name = getattr(last_tool_call, "name", "")
    if tool_name != "execute_workflow_node":
        return {}

    tool_content = getattr(last_tool_call, "content", "")
    if not tool_content:
        return {}

    try:
        result = json.loads(tool_content)
    except json.JSONDecodeError:
        return {}

    if not isinstance(result, dict) or not result.get("needs_review"):
        return {}

    quality_check = result.get("quality_check", {})
    pending_review = {
        "node_id": result.get("node_id", ""),
        "node_label": result.get("node_label", ""),
        "output_preview": result.get("output", "")[:1000],
        "reason": quality_check.get("reason", "输出质量不满足角色节点要求"),
        "system_prompt": quality_check.get("system_prompt", ""),
    }
    return {"pending_review": pending_review}
