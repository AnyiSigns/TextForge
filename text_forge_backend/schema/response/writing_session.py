from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class WritingSessionResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    book_id: int = Field(alias="bookId")
    chapter_id: Optional[int] = Field(default=None, alias="chapterId")
    character_ids: List[int] = Field(default=[], alias="characterIds")
    words_written: int = Field(alias="wordsWritten")
    duration_seconds: int = Field(alias="durationSeconds")
    started_at: Optional[str] = Field(default=None, alias="startedAt")
    ended_at: Optional[str] = Field(default=None, alias="endedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
