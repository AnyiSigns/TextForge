from functools import partial

from langgraph.graph import END, StateGraph

from ..agent_nodes import (
    agent_call,
    agent_router,
    gated_tool_node,
    quality_gate_node,
    quality_gate_router,
)
from ..agent_state import UserAgentState
from ..context_manager import auto_compress_node, compress_router
from ..workflow_runner_node import workflow_runner_node


async def _dispatch(state: UserAgentState) -> dict:
    """轻量入口节点：不做任何 LLM 调用，仅根据状态决定下一步路由。

    作用：审批续跑（pending_tool 已带 decision）时直接进 tool_calls 执行被拦截的写工具，
    避免无谓地重跑 agent_call 推理。
    """
    return {}


def _entry_router(state: UserAgentState) -> str:
    """入口路由（dispatch 节点后）：优先执行已审批的写工具，其次排队的工作流，否则进入 agent。"""
    # 工作流执行完成后已生成「候选正文展示」回复（candidate_reply_ready），
    # 直接 END，把候选正文呈现给用户确认，不再让模型自由发挥/空转。
    if state.get("candidate_reply_ready"):
        return END
    pending = state.get("pending_tool")
    if pending and pending.get("decision"):
        return "tool_calls"
    if state.get("pending_workflow"):
        return "workflow_runner"
    return "agent"


def build_user_agent_graph(session_factory, model_config: dict | None = None, checkpointer=None):
    tool_node = partial(gated_tool_node, session_factory=session_factory, model_config=model_config)

    builder = StateGraph(UserAgentState)
    builder.add_node("dispatch", _dispatch)
    builder.add_node("agent", agent_call)
    builder.add_node("tool_calls", tool_node)
    builder.add_node("workflow_runner", workflow_runner_node)
    builder.add_node("quality_gate", quality_gate_node)
    builder.add_node("compress", partial(auto_compress_node, session_factory=session_factory))
    builder.set_entry_point("dispatch")
    builder.add_conditional_edges("dispatch", _entry_router)
    # 关键：agent 后必须走 agent_router（有 tool_calls → tool_calls，无 → END），
    # 不能走 _entry_router（其默认返回 tool_calls，会导致「模型输出完整回复后仍被
    # 再次喂给模型 → 看到同一上下文 → 反复输出」的无限循环）。
    builder.add_conditional_edges("agent", agent_router)
    builder.add_edge("tool_calls", "quality_gate")
    # 工作流执行完成后：若生成了候选正文确认回复（candidate_reply_ready），
    # _entry_router 直接返回 END 呈现给用户；否则回 agent 继续（如审计拦截恢复）。
    builder.add_conditional_edges("workflow_runner", _entry_router)
    builder.add_conditional_edges("quality_gate", quality_gate_router)
    builder.add_conditional_edges("compress", compress_router)
    return builder.compile(checkpointer=checkpointer)

