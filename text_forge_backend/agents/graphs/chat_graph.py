from agents.audit_node import audit_node
from agents.chat_nodes import agent_call, tools_node, chat_router
from agents.router_node import router_node
from agents.state import (
    AuditState,
    GraphState,
    RouterState,
    ToolState,
    MainState,
    ParentState,
)
from langgraph.graph import StateGraph, START, END
from agents.tool_node import tool_node
from agents.main_node import main_node
from agents.manager_node import (
    call_audit,
    call_compression,
    call_main,
    call_tool,
    manager_node,
    route_after_manager,
)


def build_chat_graph():
    """聊天对话图"""
    builder = StateGraph(GraphState)  # type: ignore
    builder.add_node("agent", agent_call)  # type: ignore
    builder.add_node("tools", tools_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", chat_router)
    builder.add_edge("tools", "agent")
    return builder


def build_router_graph():
    """路由子图"""
    builder = StateGraph(RouterState)
    builder.add_node("router", router_node)
    builder.add_edge(START, "router")
    builder.add_edge("router", END)
    return builder


def build_tool_graph():
    builder = StateGraph(ToolState)
    builder.add_node("tool", tool_node)
    builder.add_edge(START, "tool")
    builder.add_edge("tool", END)
    return builder


def build_main_graph():
    builder = StateGraph(MainState)
    builder.add_node("main", main_node)
    builder.add_edge(START, "main")
    builder.add_edge("main", END)
    return builder


def build_audit_graph():
    builder = StateGraph(AuditState)
    builder.add_node("audit", audit_node)
    builder.add_edge(START, "audit")
    builder.add_edge("audit", END)
    return builder


def build_parent_graph():
    builder = StateGraph(ParentState)

    # Manager 节点
    builder.add_node("manager", manager_node)

    # 子图调用节点
    builder.add_node("call_tool", call_tool)
    builder.add_node("call_main", call_main)
    builder.add_node("call_compression", call_compression)
    builder.add_node("call_audit", call_audit)

    # 入口 -> Manager
    builder.add_edge(START, "manager")

    # Manager -> 路由 -> 子图调用节点
    builder.add_conditional_edges("manager", route_after_manager)

    # 所有子图调用节点执行完后 -> 回到 Manager（闭环调度）
    builder.add_edge("call_tool", "manager")
    builder.add_edge("call_main", "manager")
    builder.add_edge("call_compression", "manager")
    builder.add_edge("call_audit", "manager")
    return builder


chat_graph = build_chat_graph()
router_graph = build_router_graph()
tool_graph = build_tool_graph()
audit_graph = build_audit_graph()
main_graph = build_main_graph()
parent_graph = build_parent_graph()
