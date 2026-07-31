from typing import Any, Dict, List, Optional, TypedDict, Annotated
from langgraph.graph import add_messages


def _merge_dicts(a: dict, b: dict) -> dict:
    result = a.copy()
    result.update(b)
    return result


class UserAgentState(TypedDict):
    messages: Annotated[list, add_messages]
    user_id: int
    active_book_id: int
    model_config: dict
    step_outputs: Annotated[dict, _merge_dicts]
    previous_chapter_summary: Optional[str]
    previous_chapter_content: Optional[str]
    cross_chapter_context: Annotated[dict, _merge_dicts]
