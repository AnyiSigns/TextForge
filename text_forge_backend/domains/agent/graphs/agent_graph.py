import hashlib
import json
from functools import partial
from typing import Any

from langgraph.graph import END, START, StateGraph

from ..agent_nodes import (
    agent_call,
    agent_router,
    chat_node,
    gated_tool_node,
    guardrail_node,
    quality_gate_router,
    supervisor_node,
    supervisor_router,
)
from ..agent_state import SubgraphInput, SubgraphOutput, SubgraphState, UserAgentState
from ..context_manager import auto_compress_node
from ..workflow_runner_node import workflow_runner_node

SUBGRAPH_NODES = ("worldbuilding", "outlining", "drafting", "revising")

# =====================================================================
# 嵌套子图（重建，2026-08-11）
# ---------------------------------------------------------------------
# 曾因 langgraph 1.2.9 两个回归回退扁平节点，现均已解决（venv 实测验证）：
# 1) 流式事件丢失：父图 astream 必须开 subgraphs=True，子图内 get_stream_writer()
#    才会继承父流（router.py 已改 (ns, mode, data) 三元组解包 + 顶层子图 update 去重）；
# 2) merge_metrics 指数翻倍：编译子图作节点返回「全量 state」而非 delta，父图对
#    求和 reducer 通道二次合并 → 1→3→7→15。解法 = 私有通道 + 输出契约：
#    - turn_metrics / subgraph_steps 只声明在 SubgraphState（每次进入子图全新），
#      不出现在 SubgraphOutput 白名单 → 不回流父图；
#    - 子图末尾 final 节点把两者汇总进 subgraph_report（LastValue），
#      父图 sync 节点用 merge_metrics 合并一次后清空 → 每子图回合恰好合并一次；
#    - messages 累计回流安全：父图 add_messages 按消息 ID 去重；
#    - workflow_node_outputs / cross_chapter_context 用 merge_dicts（overlay 覆盖，
#      幂等），累计回流安全。
# =====================================================================

# 子图入口/出口的条件边映射：END 重映射到 final 结算节点（先汇总 report 再退出）。
# agent_call 目标 = 子图内 agent 节点名（与子图同名，便于顶层流式事件按节点名归类）。
def _entry_map(name: str) -> dict:
    return {
        "tool_calls": "tool_calls",
        "workflow_runner": "workflow_runner",
        "agent_call": name,
        END: "final",
    }


def subgraph_entry_router(state: SubgraphState) -> str:
    """子图入口路由（原父层 _entry_router 内移）：

    - 候选正文确认就绪 / 待审核卡 → 退出子图（人类在环，父层 supervisor_router 见之 END）
    - 已审批写工具（pending_tool.decision）→ 子图内 tool_calls 执行
    - 排队工作流 → 子图内 workflow_runner
    - 否则进入 agent_call 开始推理
    """
    if state.get("candidate_reply_ready"):
        return END
    pending = state.get("pending_tool")
    if pending and pending.get("decision"):
        return "tool_calls"
    if state.get("pending_workflow"):
        return "workflow_runner"
    if state.get("pending_review"):
        return END
    return "agent_call"


def subgraph_final_node(state: SubgraphState) -> dict[str, Any]:
    """子图出口结算：把私有通道（turn_metrics/subgraph_steps）汇总进 subgraph_report。

    report 为 LastValue：父图 sync 节点每子图回合只合并一次，无指数翻倍。
    """
    return {
        "subgraph_report": {
            "metrics": state.get("turn_metrics") or {},
            "steps": state.get("subgraph_steps") or {},
        }
    }


def sync_node(state: UserAgentState) -> dict[str, Any]:
    """父图同步节点：子图报告合并进父层指标通道（merge_metrics 加和），清空 report 防残留二次合并。

    子图压缩裁剪掉的旧消息 ID（removed_message_ids）在此转为
    RemoveMessage 应用到父层 messages 通道——add_messages 只增不减，子图内的裁剪
    不回流父层，必须在此显式删除才能实现跨回合真正裁剪。
    """
    report = state.get("subgraph_report") or {}
    update: dict[str, Any] = {"subgraph_report": None}
    metrics = report.get("metrics") or {}
    if metrics:
        update["turn_metrics"] = metrics
    steps = report.get("steps") or {}
    if steps:
        update["subgraph_steps"] = steps
    removed_ids = state.get("removed_message_ids") or []
    if removed_ids:
        from langchain_core.messages import RemoveMessage

        update["messages"] = [RemoveMessage(id=mid) for mid in removed_ids]
    update["removed_message_ids"] = None
    return update


def build_subgraph(name: str, session_factory, model_config: dict | None = None):
    """编译单个创作子图（嵌套 StateGraph + output_schema 输出契约）。

    内部拓扑（工具/门控/压缩/工作流循环全部收进子图）：
    START → subgraph_entry_router → agent_call / tool_calls / workflow_runner
    agent_call → agent_router → tool_calls / final(退出)
    tool_calls → quality_gate_router → tool_calls / workflow_runner / compress / agent_call / final
    workflow_runner → subgraph_entry_router（候选确认/审核卡 → 退出）
    compress → agent_call
    final → END（输出 = SubgraphOutput 白名单）
    """
    b = StateGraph(SubgraphState, input_schema=SubgraphInput, output_schema=SubgraphOutput)
    b.add_node(name, partial(agent_call, subgraph=name))
    b.add_node(
        "tool_calls",
        partial(gated_tool_node, session_factory=session_factory, model_config=model_config),
    )
    b.add_node("workflow_runner", partial(workflow_runner_node, session_factory=session_factory))
    b.add_node("compress", partial(auto_compress_node, session_factory=session_factory))
    b.add_node("final", subgraph_final_node)

    b.add_conditional_edges(START, subgraph_entry_router, _entry_map(name))
    b.add_conditional_edges(name, agent_router, {"tool_calls": "tool_calls", END: "final"})
    b.add_conditional_edges(
        "tool_calls",
        quality_gate_router,
        {
            "tool_calls": "tool_calls",
            "workflow_runner": "workflow_runner",
            "compress": "compress",
            # quality_gate_router 的「回 supervisor 再路由」在子图内 = 继续本子图循环
            "supervisor": name,
            END: "final",
        },
    )
    b.add_conditional_edges("workflow_runner", subgraph_entry_router, _entry_map(name))
    b.add_edge("compress", name)
    b.add_edge("final", END)
    return b.compile(name=name)


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

    builder = StateGraph(UserAgentState)
    builder.add_node("guardrail", guardrail_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("chat", chat_node)
    # 4 个真·嵌套子图（编译图作节点，input/output_schema 契约，见文件顶部注释）。
    for name in SUBGRAPH_NODES:
        builder.add_node(name, build_subgraph(name, session_factory, model_config))
    builder.add_node("sync", sync_node)

    builder.set_entry_point("guardrail")
    builder.add_edge("guardrail", "supervisor")
    builder.add_conditional_edges("supervisor", supervisor_router)
    # chat 快路径：1 步无工具循环
    builder.add_edge("chat", END)
    # 子图出口 → sync（指标合并 + report 清空）→ END。
    # 子图内工具循环/压缩/工作流全部内部消化，出口即本轮结束：
    # 纯回复 / 质量门终止 / 审核卡 / 候选正文确认 均为终止态（人类在环或收尾），
    # 父层不再回路由（回 supervisor 会造成「回复后无限重入子图再调一次模型」）。
    for name in SUBGRAPH_NODES:
        builder.add_edge(name, "sync")
    builder.add_edge("sync", END)
    graph = builder.compile(checkpointer=checkpointer)
    if checkpointer is not None:
        key = _graph_cache_key(model_config)
        if key is not None:
            _GRAPH_CACHE[key] = graph
    return graph
