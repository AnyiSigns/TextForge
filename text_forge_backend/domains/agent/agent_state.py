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
