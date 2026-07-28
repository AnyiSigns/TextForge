import operator
from typing import Any, Dict, List, Optional, TypedDict, Annotated
from langgraph.graph import add_messages


def _merge_dicts(a: dict, b: dict) -> dict:
    result = a.copy()
    result.update(b)
    return result


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]


class RouterState(TypedDict):
    task_label: str
    task_prompt: str
    decision: str
    model_config: dict


class ToolState(TypedDict):
    query: str
    tool_result: str
    model_config: dict


class MainState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: dict
    input_worldview: str
    input_characters: str
    input_brief_summary: str
    input_recent_chapters: str
    input_outline: str


class AuditState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: dict
    input_worldview: str
    input_characters: str
    input_brief_summary: str
    input_recent_chapters: str
    input_outline: str


class ParentState(TypedDict):
    input_summary: str
    input_worldview: str
    input_brief_summary: str
    input_characters: str
    input_recent_chapters: str
    input_outline: str
    workflow_nodes: List[Dict[str, Any]]
    step_outputs: Annotated[dict, _merge_dicts]
    executed_steps: Annotated[List[str], operator.add]
    metadata: Dict[str, Any]
    next_step_id: Optional[str]
    model_config: dict
    book_id: int
    user_id: int
    edges: List[Dict[str, Any]]
