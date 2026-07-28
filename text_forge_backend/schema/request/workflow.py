from typing import Any, Optional, List
from pydantic import Field, BaseModel, ConfigDict, model_validator


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
    context_fields: Optional[List[str]] = Field(default=None, alias="contextFields")
    rag_filter: Optional[RagFilter] = Field(default=None, alias="ragFilter")
    rag_top_k: Optional[int] = Field(default=None, alias="ragTopK")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")


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


class WorkflowRunRequest(BaseModel):
    book_id: Optional[int] = Field(default=None, alias="bookId")
    thread_id: Optional[str] = None
    input: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def clean_undefined(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for key in ("book_id", "thread_id", "input"):
                val = data.get(key)
                if val == "undefined" or val == "":
                    data[key] = None
        return data
