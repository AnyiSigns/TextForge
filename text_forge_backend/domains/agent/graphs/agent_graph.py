import hashlib
import json
from functools import partial
from typing import Any

from langgraph.graph import END, StateGraph

from ..agent_nodes import (
    agent_call,
    agent_router,
    chat_node,
    gated_tool_node,
    guardrail_node,
    quality_gate_node,
    quality_gate_router,
    supervisor_node,
    supervisor_router,
)
from ..agent_state import UserAgentState
from ..context_manager import auto_compress_node, compress_router
from ..workflow_runner_node import workflow_runner_node

SUBGRAPH_NODES = ("worldbuilding", "outlining", "drafting", "revising")


def _entry_router(state: UserAgentState) -> str:
    """入口/续跑路由：优先执行已审批的写工具，其次排队的工作流，否则回 supervisor。"""
    # 工作流执行完成后已生成「候选正文展示」回复（candidate_reply_ready），
    # 直接 END，把候选正文呈现给用户确认，不再让模型自由发挥/空转。
    if state.get("candidate_reply_ready"):
        return END
    pending = state.get("pending_tool")
    if pending and pending.get("decision"):
        return "tool_calls"
    if state.get("pending_workflow"):
        return "workflow_runner"
    return "supervisor"


# 进程级编译缓存：按 model_config 签名复用已编译的 LangGraph，避免每请求重建。
_GRAPH_CACHE: dict[str, Any] = {}


def _graph_cache_key(model_config: dict | None) -> str | None:
    if model_config is None:
        return None
    try:
        return hashlib.md5(
            json.dumps(model_config, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
    except Exception:
        return None


def build_user_agent_graph(session_factory, model_config: dict | None = None, checkpointer=None):
    # 有 checkpointer 且 config 可哈希时复用已编译图；session_factory 为单例，
    # checkpointer 为单例，缓存安全。
    if checkpointer is not None:
        key = _graph_cache_key(model_config)
        if key is not None and key in _GRAPH_CACHE:
            return _GRAPH_CACHE[key]

    tool_node = partial(gated_tool_node, session_factory=session_factory, model_config=model_config)

    builder = StateGraph(UserAgentState)
    builder.add_node("dispatch", lambda state: {})
    builder.add_node("guardrail", guardrail_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("chat", chat_node)
    # 4 个子图 = 共享工具/门控/质量门 + 子图聚焦 prompt 的 agent 节点。
    # 子图出口经 agent_router 判断（有 tool_calls → 共享 tool_calls，无 → END），
    # tool_calls → quality_gate → supervisor 再路由（状态机单一出口）。
    for name in SUBGRAPH_NODES:
        builder.add_node(name, partial(agent_call, subgraph=name))
    builder.add_node("tool_calls", tool_node)
    builder.add_node("workflow_runner", workflow_runner_node)
    builder.add_node("quality_gate", quality_gate_node)
    builder.add_node("compress", partial(auto_compress_node, session_factory=session_factory))

    builder.set_entry_point("dispatch")
    builder.add_edge("dispatch", "guardrail")
    builder.add_edge("guardrail", "supervisor")
    builder.add_conditional_edges("supervisor", supervisor_router)
    # chat 快路径：1 步无工具循环
    builder.add_edge("chat", END)
    # 子图出口：有 tool_calls → 共享 tool_calls；无 → END（模型直接回复）
    for name in SUBGRAPH_NODES:
        builder.add_conditional_edges(name, agent_router)
    # 关键：agent 后必须走 agent_router（有 tool_calls → tool_calls，无 → END），
    # 不能直接回 supervisor（会导致「模型输出完整回复后仍被再次喂给模型」的无限循环）。
    builder.add_edge("tool_calls", "quality_gate")
    # 工作流执行完成后：若生成了候选正文确认回复（candidate_reply_ready），
    # _entry_router 直接返回 END 呈现给用户；否则回 supervisor 再路由（如审计拦截恢复）。
    builder.add_conditional_edges("workflow_runner", _entry_router)
    builder.add_conditional_edges("quality_gate", quality_gate_router)
    builder.add_conditional_edges("compress", compress_router)
    graph = builder.compile(checkpointer=checkpointer)
    if checkpointer is not None:
        key = _graph_cache_key(model_config)
        if key is not None:
            _GRAPH_CACHE[key] = graph
    return graph
