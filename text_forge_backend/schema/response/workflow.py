from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ListWorkflowsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflows: List["Workflow"]


class WorkflowDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflow: "Workflow"


class RagFilter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    doc_ids: Optional[List[str]] = Field(default=None, alias="docIds")
    author_ids: Optional[List[str]] = Field(default=None, alias="authorIds")
    sample: Optional[str] = None


class WorkflowNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    label: str
    system_prompt: Optional[str] = Field(default=None, alias="systemPrompt")
    tier: Optional[str] = None
    context_fields: Optional[List[str]] = Field(default=None, alias="contextFields")
    rag_filter: Optional[RagFilter] = Field(default=None, alias="ragFilter")
    rag_top_k: Optional[int] = Field(default=None, alias="ragTopK")


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str


class WorkflowNodeSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None


class Workflow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None
    builtin: Optional[bool] = Field(default=False)
