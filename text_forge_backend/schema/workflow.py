from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class RagFilter(BaseModel):
    model_config = {}

    doc_ids: Optional[List[str]] = Field(default=None, alias="docIds")
    author_ids: Optional[List[str]] = Field(default=None, alias="authorIds")
    sample: Optional[str] = None


class WorkflowNode(BaseModel):
    model_config = {}

    id: str
    label: str
    system_prompt: Optional[str] = Field(default=None, alias="systemPrompt")
    tier: Optional[Literal["cheap", "standard"]] = None
    context_fields: Optional[List[str]] = Field(default=None, alias="contextFields")
    rag_filter: Optional[RagFilter] = Field(default=None, alias="ragFilter")
    rag_top_k: Optional[int] = Field(default=3, alias="ragTopK")
    executor: Optional[Literal["main", "audit", "tool", "auto"]] = "auto"


class WorkflowEdge(BaseModel):
    model_config = {}

    from_: str = Field(alias="from")
    to: str


class Workflow(BaseModel):
    model_config = {}

    id: str
    name: str
    description: Optional[str] = None
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None
    builtin: Optional[bool] = False
