from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class OutlineResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    data: Optional[Any] = Field(default=None, description="大纲嵌套结构")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListOutlinesResponse(BaseModel):
    outlines: List[OutlineResponse]
