from typing import Optional, List
from pydantic import Field, BaseModel


class RagFilter(BaseModel):
    doc_ids: Optional[List[str]] = Field(default=None, alias="docIds")
    author_ids: Optional[List[str]] = Field(default=None, alias="authorIds")
    sample: Optional[str] = None


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


class WorkflowEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str


class WorkflowSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None


class Workflow(WorkflowSummary):
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None
    builtin: Optional[bool] = Field(default=False)


class WorkflowDetailRequest(BaseModel):
    workflow: Workflow
