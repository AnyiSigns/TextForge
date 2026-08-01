
from pydantic import BaseModel, ConfigDict, Field


class WorkflowRunRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int
    thread_id: str
    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class WorkflowNodeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    description: str | None = None
