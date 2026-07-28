from typing import Optional, Any
from pydantic import BaseModel, Field


class OutlineRequest(BaseModel):
    book_id: Optional[int] = Field(default=None, alias="bookId")
    data: Optional[Any] = Field(default=None, description="大纲嵌套结构")
    chapter_id: Optional[str] = Field(default=None, alias="chapterId")
    summary: Optional[str] = Field(default=None, description="章节摘要")
