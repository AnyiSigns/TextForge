from typing import Annotated, TypedDict

from langgraph.graph import add_messages

from shared.utils import merge_dicts as _merge_dicts


def merge_dicts_or_clear(base: dict | None, overlay: dict | None) -> dict | None:
    """merge_dicts 的可清空变体：overlay 为 None 时整体清空通道（返回 None）。

    任务 30（审查修复 M8）：共享的 merge_dicts 是纯 overlay 合并，空 dict {}
    覆盖是 no-op，无法清除 workflow_node_outputs 等通道的旧值；terminate 工作流后
    旧节点输出会滞留，write_workflow_candidate 仍能读到过期候选。此 reducer 允许
    调用方传 None 真正清空（LastValue 通道返回 None 即置空）。
    """
    if overlay is None:
        return None
    return _merge_dicts(base or {}, overlay)


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
    # 任务 30（审查修正）：step_outputs 在主 agent 图中无生产者/消费者，
    # 但 GenerateChapterState 继承本状态并实际读写它（generate_chapter 子图 think/reflect
    # 节点写入 step_outputs），故保留不删。
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
    workflow_node_outputs: Annotated[dict | None, merge_dicts_or_clear]
    personal_rag_results: list | None
    terminate_chapter_id: int | None
    pending_workflow: dict | None  # 由 execute_workflow/execute_workflow_node 工具写入，交由原生 workflow_runner 节点执行
    pending_tool: dict | None  # 被门控拦截、等待用户审批的写工具调用 {tool_name, tool_args, tool_id, decision?, edited_content?}
    workflow_result: dict | None  # 工作流执行结果（含 content_nodes 候选正文），由 workflow_runner 节点写入
    candidate_reply_ready: bool  # 工作流完成后是否已生成「候选正文确认」回复，subgraph_entry_router 据此直接退出子图
    suggestions_signature: str | None  # 最近一次已推送的建议组合签名，用于跨回合去重（避免每次回复都重复刷屏）
    preferred_workflow_node: str | None  # 用户最近一次选定的工作流候选节点 ID，后续多章自动沿用（不再每章询问）
    subgraph: str  # 当前创作子图：chat/worldbuilding/outlining/drafting/revising（supervisor 分类结果）
    resume_from_subgraph: str | None  # resume 回合直接回原子图，不重新分类
    # 任务 13：drafting/revising 进入前装配的域上下文（章摘要 + 场景 + 角色卡），
    # 由 supervisor_node 对新用户消息路由到对应子图时写入，agent_call 注入 prompt。
    domain_context: str | None
    last_digest_message_count: int | None  # 任务 19b：最近一次 auto_digest 时的消息数，用于节流（新增 ≥ N 条才再生成摘要）
    # 任务 28 指标层：单回合跨节点累加的计数器（LLM 调用/工具成败/压缩次数/审批计数/按子图步数）。
    # 嵌套子图版：父图通道由 sync 节点合并子图 subgraph_report 而来（每子图回合一次），
    # 不再由子图内节点直接写入（私有通道见 SubgraphState，防求和 reducer 二次合并翻倍）。
    turn_metrics: Annotated[dict, merge_metrics]
    subgraph_steps: Annotated[dict, merge_metrics]  # 子图 step cap：{subgraph: 已执行步数}（父层仅作指标统计）
    subgraph_report: dict | None  # 子图出口结算报告 {metrics, steps}（LastValue，sync 节点合并后清空）
    # 任务 30（压缩修复）：子图压缩裁剪掉的旧消息 ID，由 sync 节点转成 RemoveMessage
    # 应用到父层 messages 通道，实现跨回合真正裁剪（add_messages 只增不减）。
    removed_message_ids: list | None


class SubgraphInput(TypedDict):
    """子图输入投影（input_schema）：父图 → 子图的通道白名单。

    刻意排除 turn_metrics / subgraph_steps / subgraph_report：
    私有通道每次进入子图必须全新（{}），否则父层已累计的指标经输入投影
    再被内部 reducer 累加、report 含父值、sync 二次加和（指标虚高/翻倍）。
    """
    messages: Annotated[list, add_messages]
    user_id: int
    active_book_id: int
    model_config: dict
    subgraph: str  # supervisor 分类结果（工具指标按子图归属统计用）
    previous_chapter_summary: str | None
    previous_chapter_content: str | None
    cross_chapter_context: Annotated[dict, _merge_dicts]
    compressed_context: str | None
    message_count_at_compress: int | None
    pending_review: dict | None
    workflow_node_outputs: Annotated[dict | None, merge_dicts_or_clear]
    personal_rag_results: list | None
    pending_workflow: dict | None
    pending_tool: dict | None
    workflow_result: dict | None
    candidate_reply_ready: bool
    preferred_workflow_node: str | None
    domain_context: str | None


class SubgraphState(TypedDict):
    """创作子图内部状态：从父图投影读入的共享通道 + 子图私有通道。

    私有通道（turn_metrics / subgraph_steps）以 merge_metrics 在子图内部累加，
    每次进入子图全新（不在 SubgraphInput 输入投影中，父图不回流，
    避免求和 reducer 二次合并指数翻倍），子图末尾由 final 节点汇总进
    subgraph_report 一次性回流。
    """
    messages: Annotated[list, add_messages]
    user_id: int
    active_book_id: int
    model_config: dict
    subgraph: str  # supervisor 分类结果（工具指标按子图归属统计用）
    previous_chapter_summary: str | None
    previous_chapter_content: str | None
    cross_chapter_context: Annotated[dict, _merge_dicts]
    compressed_context: str | None
    message_count_at_compress: int | None
    pending_review: dict | None
    workflow_node_outputs: Annotated[dict | None, merge_dicts_or_clear]
    personal_rag_results: list | None
    pending_workflow: dict | None
    pending_tool: dict | None
    workflow_result: dict | None
    candidate_reply_ready: bool
    preferred_workflow_node: str | None
    domain_context: str | None
    # 私有通道：子图内跨节点累加，不回流父图（output_schema 白名单外）
    turn_metrics: Annotated[dict, merge_metrics]
    subgraph_steps: Annotated[dict, merge_metrics]
    subgraph_report: dict | None  # 出口结算报告（LastValue，final 节点写入）
    # 任务 30（压缩修复）：压缩裁剪掉的旧消息 ID（LastValue），由 SubgraphOutput 回流父层，
    # sync 节点转成 RemoveMessage 应用到父层 messages 通道。
    removed_message_ids: list | None


class SubgraphOutput(TypedDict):
    """子图输出契约（output_schema）：回流父图的通道白名单。

    - messages 为累计值：父图 add_messages 按消息 ID 去重，回流安全；
    - 其余为 LastValue / merge_dicts（overlay 覆盖，幂等）通道，直接覆盖父值；
    - turn_metrics / subgraph_steps 为私有通道，不回流（防求和 reducer 翻倍），
      由 final 节点汇总进 subgraph_report。
    """
    messages: list
    pending_review: dict | None
    pending_tool: dict | None
    pending_workflow: dict | None
    workflow_result: dict | None
    workflow_node_outputs: dict | None
    candidate_reply_ready: bool
    preferred_workflow_node: str | None
    compressed_context: str | None
    message_count_at_compress: int | None
    subgraph_report: dict | None
    removed_message_ids: list | None  # 任务 30（压缩修复）：裁剪掉的旧消息 ID，供父层 sync 应用删除
