from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class WritingSessionCreateRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    chapter_id: Optional[int] = Field(default=None, alias="chapterId")
    character_ids: Optional[List[int]] = Field(default=[], alias="characterIds")

    model_config = ConfigDict(populate_by_name=True)


class WritingSessionEndRequest(BaseModel):
    words_written: int = Field(alias="wordsWritten")
    duration_seconds: int = Field(alias="durationSeconds")

    model_config = ConfigDict(populate_by_name=True)
