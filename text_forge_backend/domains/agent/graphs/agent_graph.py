from typing import Optional
from ..agent_state import UserAgentState
from ..agent_nodes import agent_call, agent_router
from ..context_manager import auto_compress_node, compress_router
from ..tools_domain import build_tool_node
from langgraph.graph import StateGraph


def build_user_agent_graph(session_factory, model_config: Optional[dict] = None, checkpointer=None):
    builder = StateGraph(UserAgentState)
    builder.add_node("agent", agent_call)
    tool_node = build_tool_node(session_factory, model_config=model_config)
    builder.add_node("tool_calls", tool_node)
    builder.add_node("compress", auto_compress_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", agent_router)
    builder.add_edge("tool_calls", "compress")
    builder.add_conditional_edges("compress", compress_router)
    return builder.compile(checkpointer=checkpointer)
