from functools import partial

from langgraph.graph import StateGraph

from ..agent_nodes import (
    agent_call,
    agent_router,
    quality_gate_node,
    quality_gate_router,
)
from ..agent_state import UserAgentState
from ..context_manager import auto_compress_node, compress_router
from ..tools_domain import build_tool_node
from ..workflow_runner_node import workflow_runner_node


def _workflow_router(state: UserAgentState) -> str:
    """Agent 决策后路由：优先执行已排队的原生工作流节点。"""
    if state.get("pending_workflow"):
        return "workflow_runner"
    return "tool_calls"


def build_user_agent_graph(session_factory, model_config: dict | None = None, checkpointer=None):
    tool_node = build_tool_node(session_factory, model_config=model_config)

    builder = StateGraph(UserAgentState)
    builder.add_node("agent", agent_call)
    builder.add_node("tool_calls", tool_node)
    builder.add_node("workflow_runner", workflow_runner_node)
    builder.add_node("quality_gate", quality_gate_node)
    builder.add_node("compress", partial(auto_compress_node, session_factory=session_factory))
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", _workflow_router)
    builder.add_edge("tool_calls", "quality_gate")
    builder.add_conditional_edges("workflow_runner", agent_router)
    builder.add_conditional_edges("quality_gate", quality_gate_router)
    builder.add_conditional_edges("compress", compress_router)
    return builder.compile(checkpointer=checkpointer)
