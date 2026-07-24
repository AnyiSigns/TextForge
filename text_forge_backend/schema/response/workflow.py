from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class RagFilter(BaseModel):
    doc_ids: Optional[List[str]] = Field(default=None, alias="docIds")
    author_ids: Optional[List[str]] = Field(default=None, alias="authorIds")
    sample: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkflowNode(BaseModel):
    id: str
    kind: str
    label: str
    system_prompt: Optional[str] = Field(default=None, alias="systemPrompt")
    role_id: Optional[str] = Field(default=None, alias="roleId")
    tier: Optional[str] = None
    depends_on: Optional[List[str]] = Field(default=None, alias="dependsOn")
    tool_ids: Optional[List[str]] = Field(default=None, alias="toolIds")
    auxiliary_model_ids: Optional[List[str]] = Field(
        default=None, alias="auxiliaryModelIds"
    )
    rag_filter: Optional[RagFilter] = Field(default=None, alias="ragFilter")
    rag_top_k: Optional[int] = Field(default=None, alias="ragTopK")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkflowEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkflowSummary(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Workflow(WorkflowSummary):
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None
    builtin: Optional[bool] = Field(default=False)
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListWorkflowsResponse(BaseModel):
    workflows: List[Workflow]
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkflowDetailResponse(BaseModel):
    workflow: Workflow
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
