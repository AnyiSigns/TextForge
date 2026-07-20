from agents.nodes import agent_call,tools_node,chat_router
from agents.state import GraphState
from langgraph.graph import StateGraph



def build_chat_graph():
    """聊天对话图"""
    builder=StateGraph(GraphState)    #type:ignore
    builder.add_node("agent",agent_call)    #type:ignore
    builder.add_node("tools",tools_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent",chat_router)
    builder.add_edge("tools","agent")
    return builder


chat_graph=build_chat_graph()


