from typing import Optional, Dict, Any
from agents.agent_state import UserAgentState
from agents.agent_nodes import agent_call, agent_router
from agents.tools_domain import build_tool_node
from langgraph.graph import StateGraph, START, END


def build_user_agent_graph(session_factory, model_config: Optional[dict] = None):
    builder = StateGraph(UserAgentState)
    builder.add_node("agent", agent_call)
    tool_node = build_tool_node(session_factory, model_config=model_config)
    builder.add_node("tool_calls", tool_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", agent_router)
    builder.add_edge("tool_calls", "agent")
    return builder
