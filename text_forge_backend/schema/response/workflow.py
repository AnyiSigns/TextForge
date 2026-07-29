from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from schema.workflow import RagFilter, Workflow, WorkflowEdge, WorkflowNode


class ListWorkflowsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflows: List["Workflow"]


class WorkflowDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflow: "Workflow"


class WorkflowNodeSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
