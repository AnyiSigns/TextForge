
from pydantic import BaseModel, ConfigDict, Field


class WritingSessionResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    book_id: int = Field(alias="bookId")
    chapter_id: int | None = Field(default=None, alias="chapterId")
    character_ids: list[int] = Field(default=[], alias="characterIds")
    words_written: int = Field(alias="wordsWritten")
    duration_seconds: int = Field(alias="durationSeconds")
    started_at: str | None = Field(default=None, alias="startedAt")
    ended_at: str | None = Field(default=None, alias="endedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
