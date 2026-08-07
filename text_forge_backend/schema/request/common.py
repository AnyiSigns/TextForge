from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    thread_id: str
    message: str
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
    # 可选：当前书籍 id。Agent 对话时若用户已切换书籍/旧会话 book_id 为 0，
    # 前端每次请求携带当前 book_id，后端据此修正会话绑定的书籍。
    book_id: int | None = Field(default=None, alias="bookId")


class CompressRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")


class ReviewActionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")
    action: Literal["retry", "accept", "edit", "terminate"]
    edited_content: str | None = Field(default=None, alias="editedContent")
    chapter_id: int | None = Field(default=None, alias="chapterId")
