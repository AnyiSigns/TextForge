from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from schema.workflow import Workflow, WorkflowEdge, WorkflowNode, RagFilter


class WorkflowRunRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int
    thread_id: str


class WorkflowNodeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    description: Optional[str] = None
