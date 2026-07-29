from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class AgentMemoryResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    book_id: Optional[int] = Field(default=None, alias="bookId")
    memory_type: str = Field(alias="memoryType")
    content: str
    related_chapter_id: Optional[int] = Field(default=None, alias="relatedChapterId")
    related_character_ids: Optional[List[int]] = Field(default=[], alias="relatedCharacterIds")
    priority: int
    source: str
    meta: Optional[dict] = None
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")
    distance: Optional[float] = None

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
