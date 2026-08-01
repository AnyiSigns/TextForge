
from pydantic import BaseModel, ConfigDict, Field


class AgentMemoryResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    book_id: int | None = Field(default=None, alias="bookId")
    memory_type: str = Field(alias="memoryType")
    content: str
    related_chapter_id: int | None = Field(default=None, alias="relatedChapterId")
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    priority: int
    source: str
    meta: dict | None = None
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    distance: float | None = None

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
