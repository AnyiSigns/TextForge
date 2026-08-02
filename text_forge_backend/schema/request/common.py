from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    thread_id: str
    message: str
    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class CompressRequest(BaseModel):
    thread_id: str


class ReviewActionRequest(BaseModel):
    thread_id: str
    action: Literal["retry", "accept", "edit"]
    edited_content: str | None = None
