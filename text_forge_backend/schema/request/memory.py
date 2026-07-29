from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class AgentMemoryRequest(BaseModel):
    book_id: Optional[int] = Field(default=None, alias="bookId")
    memory_type: str = Field(alias="memoryType")
    content: str
    related_chapter_id: Optional[int] = Field(default=None, alias="relatedChapterId")
    related_character_ids: Optional[List[int]] = Field(default=[], alias="relatedCharacterIds")
    priority: Optional[int] = Field(default=5)
    source: Optional[str] = "user_manual"
    meta: Optional[dict] = Field(default=None)
    mode: Optional[str] = "fulltext"
    query: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class AgentMemoryUpdateRequest(BaseModel):
    memory_type: Optional[str] = Field(default=None, alias="memoryType")
    content: Optional[str] = None
    priority: Optional[int] = None
    meta: Optional[dict] = Field(default=None)

    model_config = ConfigDict(populate_by_name=True)
