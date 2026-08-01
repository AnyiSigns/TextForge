from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class OutlineResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    data: Any | None = Field(default=None, description="大纲嵌套结构")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListOutlinesResponse(BaseModel):
    outlines: list[OutlineResponse]
