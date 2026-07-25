import operator
from typing import Any, Dict, List, Optional, TypedDict, Annotated
from langgraph.graph import add_messages
from model.model import ModelConfig


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]


class RouterState(TypedDict):
    task_label: str
    task_prompt: str
    decision: str
    model_config: ModelConfig


class ToolState(TypedDict):
    query: str
    tool_result: str
    model_config: ModelConfig


class MainState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: ModelConfig


class AuditState(TypedDict):
    system_prompt: str
    input_context: Dict[str, Any]
    output: str
    model_config: ModelConfig


class ParentState(TypedDict):
    input_messages: str
    workflow_nodes: List[Dict[str, Any]]
    step_outputs: Dict[str, Any]
    executed_steps: Annotated[List[str], operator.add]
    metadata: Dict[str, Any]
    next_step_id: Optional[str]
    model_config: ModelConfig
