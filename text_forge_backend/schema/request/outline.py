from typing import Any

from pydantic import BaseModel, Field


class OutlineRequest(BaseModel):
    book_id: int | None = Field(default=None, alias="bookId")
    data: Any | None = Field(default=None, description="大纲嵌套结构")
    chapter_id: int | None = Field(default=None, alias="chapterId")
    summary: str | None = Field(default=None, description="章节摘要")
