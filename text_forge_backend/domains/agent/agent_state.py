from typing import Annotated, TypedDict

from langgraph.graph import add_messages

from shared.utils import merge_dicts as _merge_dicts


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
