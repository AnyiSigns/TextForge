from typing import Optional, TypedDict, Annotated
from langgraph.graph import add_messages
from shared.utils import merge_dicts as _merge_dicts


class UserAgentState(TypedDict):
    messages: Annotated[list, add_messages]
    user_id: int
    active_book_id: int
    model_config: dict
    step_outputs: Annotated[dict, _merge_dicts]
    previous_chapter_summary: Optional[str]
    previous_chapter_content: Optional[str]
    cross_chapter_context: Annotated[dict, _merge_dicts]
