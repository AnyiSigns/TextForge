from typing import Dict, Any, List
from .agent_state import UserAgentState
from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool
from core.model_factory import ModelFactory
from langgraph.graph import END
import json
from shared.utils import truncate_text

AGENT_SYSTEM_PROMPT = """你是 TextForge Agent，一位专业的 AI 文学创作助手。
你可以通过调用 execute_workflow_node 执行工作流节点来生成内容，也可以使用其他工具进行人物管理、大纲编排、RAG 检索等操作。"""


async def agent_call(state: UserAgentState) -> Dict[str, Any]:
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


def _resolve_agent_tools(state: UserAgentState) -> List[BaseTool]:
    model_config = state.get("model_config") or {}
    if not model_config:
        return []
    from .tools_domain import _build_agent_tools as _domain_build_tools
    from shared.database import db_manager
    return _domain_build_tools(db_manager.session_factory, model_config=model_config)


def agent_router(state: UserAgentState) -> str:
    """Agent 路由函数。

    Args:
        state: Agent 状态。

    Returns:
        下一节点名称或 END。
    """
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tool_calls"
    return END
