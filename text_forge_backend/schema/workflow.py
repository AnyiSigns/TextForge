from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RagFilter(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    query: str | None = None
    doc_ids: list[str] | None = Field(default=None, alias="docIds")
    author_ids: list[str] | None = Field(default=None, alias="authorIds")
    sample: str | None = None


class WorkflowNode(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    label: str
    system_prompt: str | None = Field(default=None, alias="systemPrompt")
    tier: Literal["cheap", "standard"] | None = None
    context_fields: list[str] | None = Field(default=None, alias="contextFields")
    rag_filter: RagFilter | None = Field(default=None, alias="ragFilter")
    rag_top_k: int | None = Field(default=3, alias="ragTopK")
    executor: Literal["main", "audit", "tool", "router"] | None = "main"


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    from_: str = Field(alias="from")
    to: str


class Workflow(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    description: str | None = None
    nodes: list[WorkflowNode] | None = None
    edges: list[WorkflowEdge] | None = None
    builtin: bool | None = False
