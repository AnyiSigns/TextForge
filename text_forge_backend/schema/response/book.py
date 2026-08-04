from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BookResponse(BaseModel):
    id: int
    title: str
    genre: str | None = None
    description: str | None = None
    pinned: bool | None = False
    workflow_id: str | None = Field(alias="workflowId")
    total_word_goal: int | None = Field(default=0, alias="totalWordGoal")
    current_word_count: int | None = Field(default=0, alias="currentWordCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class BookVersionResponse(BaseModel):
    book: BookResponse
    version: int | None


class VolumeResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    title: str
    summary: str | None = None
    sort_order: int = Field(default=0, alias="sortOrder")
    created_at: datetime = Field(alias="createdAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterResponse(BaseModel):
    id: int
    volume_id: int = Field(alias="volumeId")
    title: str
    summary: str | None = None
    sort_order: int = Field(default=0, alias="sortOrder")
    character_ids: list[int] = Field(default=[], alias="characterIds")
    locked: bool = Field(default=False)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class SceneEventResponse(BaseModel):
    id: int
    chapter_id: int = Field(alias="chapterId")
    title: str
    content: str | None = None
    sort_order: int = Field(default=0, alias="sortOrder")
    character_ids: list[int] = Field(default=[], alias="characterIds")
    locked: bool = Field(default=False)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterContentResponse(BaseModel):
    id: int
    chapter_id: int = Field(alias="chapterId")
    content: str | None = None
    version: int
    created_at: datetime = Field(alias="createdAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterContentDiffResponse(BaseModel):
    from_version: int = Field(alias="fromVersion")
    to_version: int = Field(alias="toVersion")
    from_content: str = Field(alias="fromContent")
    to_content: str = Field(alias="toContent")
    from_created_at: str | None = Field(default=None, alias="fromCreatedAt")
    to_created_at: str | None = Field(default=None, alias="toCreatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CharacterResponse(BaseModel):
    id: int
    name: str
    description: str
    book_id: int | None = Field(alias="bookId")
    avatar_url: str | None = Field(default=None, alias="avatarUrl")
    aliases: list[str] | None = None
    role_type: str | None = Field(default=None, alias="roleType")
    status: str | None = None
    relationship_chain: list[dict[str, Any]] | None = Field(default=None, alias="relationshipChain")
    locked: bool = Field(default=False)
    custom_fields: dict[str, Any] = Field(default={}, alias="customFields")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListCharactersResponse(BaseModel):
    characters: list[CharacterResponse]
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class BookDetailResponse(BaseModel):
    book: BookResponse
    characters: list[CharacterResponse]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CreativeSettingResponse(BaseModel):
    book_id: int = Field(alias="bookId")
    tone: str | None = None
    worldview: str | None = None
    writing_taboos: str | None = Field(default=None, alias="writingTaboos")
    custom_dimensions: dict | None = Field(default=None, alias="customDimensions")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
