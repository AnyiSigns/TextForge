from typing import Annotated, TypedDict

from langgraph.graph import add_messages

from shared.utils import merge_dicts as _merge_dicts


def merge_metrics(base: dict | None, overlay: dict | None) -> dict:
    """指标聚合 reducer：数值相加、嵌套 dict 递归合并（其余类型取 overlay）。

    用于 turn_metrics / subgraph_steps 等需要「同回合跨节点累加」的计数器字段，
    与 merge_dicts（直接覆盖）语义不同。

    特殊值：overlay 含 "__reset__": True 时整体重置（新用户回合由
    _prepare_agent_state 传入，避免 checkpoint 旧值被保留导致跨回合累计）。
    """
    overlay = overlay or {}
    if overlay.get("__reset__"):
        return {k: v for k, v in overlay.items() if k != "__reset__"}
    result = dict(base or {})
    for key, value in overlay.items():
        if key == "__reset__":
            continue
        if isinstance(value, dict):
            result[key] = merge_metrics(result.get(key), value)
        elif isinstance(value, (int, float)):
            result[key] = result.get(key, 0) + value
        else:
            result[key] = value
    return result


class UserAgentState(TypedDict):
    messages: Annotated[list, add_messages]
    user_id: int
    active_book_id: int
    model_config: dict
    step_outputs: Annotated[dict, _merge_dicts]
    previous_chapter_summary: str | None
    previous_chapter_content: str | None
    cross_chapter_context: Annotated[dict, _merge_dicts]
    compressed_context: str | None
    message_count_at_compress: int | None
    active_workflow_id: str | None
    pending_review: dict | None
    review_decision: str | None
    edited_content: str | None
    workflow_node_outputs: Annotated[dict, _merge_dicts]
    personal_rag_results: list | None
    terminate_chapter_id: int | None
    pending_workflow: dict | None  # 由 execute_workflow/execute_workflow_node 工具写入，交由原生 workflow_runner 节点执行
    pending_tool: dict | None  # 被门控拦截、等待用户审批的写工具调用 {tool_name, tool_args, tool_id, decision?, edited_content?}
    workflow_result: dict | None  # 工作流执行结果（含 content_nodes 候选正文），由 workflow_runner 节点写入
    candidate_reply_ready: bool  # 工作流完成后是否已生成「候选正文确认」回复，_entry_router 据此直接 END
    suggestions_signature: str | None  # 最近一次已推送的建议组合签名，用于跨回合去重（避免每次回复都重复刷屏）
    preferred_workflow_node: str | None  # 用户最近一次选定的工作流候选节点 ID，后续多章自动沿用（不再每章询问）
    subgraph: str  # 当前创作子图：chat/worldbuilding/outlining/drafting/revising（supervisor 分类结果）
    resume_from_subgraph: str | None  # resume 回合直接回原子图，不重新分类
    last_digest_message_count: int | None  # 任务 19b：最近一次 auto_digest 时的消息数，用于节流（新增 ≥ N 条才再生成摘要）
    # 任务 28 指标层：单回合跨节点累加的计数器（LLM 调用/工具成败/压缩次数/审批计数/按子图步数）。
    turn_metrics: Annotated[dict, merge_metrics]
    subgraph_steps: Annotated[dict, merge_metrics]  # 子图 step cap：{subgraph: 已执行步数}
