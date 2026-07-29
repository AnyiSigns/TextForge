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
    project_id: int
    workflow_node: Dict[str, Any]
    model_config: dict
    tool_result: str
    context_fields: List[str]
    context_pool: Dict[str, List[int]]


class MainState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: dict
    project_id: int
    context_fields: List[str]
    context_pool: Dict[str, List[int]]


class AuditState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: dict
    project_id: int
    context_fields: List[str]
    context_pool: Dict[str, List[int]]


class ParentState(TypedDict):
    book_id: int
    user_id: int
    model_config: dict
    workflow_nodes: List[Dict[str, Any]]
    step_outputs: Annotated[dict, _merge_dicts]
    executed_steps: Annotated[List[str], operator.add]
    metadata: Dict[str, Any]
    next_step_id: Optional[str]
    edges: List[Dict[str, Any]]
    book_title: str
    book_description: str
    book_genre: str
