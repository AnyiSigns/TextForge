from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    thread_id: str
    message: str
    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class CompressRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")


class ReviewActionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")
    action: Literal["retry", "accept", "edit", "terminate"]
    edited_content: str | None = Field(default=None, alias="editedContent")
    chapter_id: int | None = Field(default=None, alias="chapterId")
