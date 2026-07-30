from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class BookResponse(BaseModel):
    id: int
    title: str
    genre: Optional[str] = None
    description: Optional[str] = None
    pinned: Optional[bool] = False
    workflow_id: Optional[str] = Field(alias="workflowId")
    total_word_goal: Optional[int] = Field(default=0, alias="totalWordGoal")
    current_word_count: Optional[int] = Field(default=0, alias="currentWordCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class BookVersionResponse(BaseModel):
    book: BookResponse
    version: Optional[int]


class VolumeResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    title: str
    summary: Optional[str] = None
    sort_order: int = Field(default=0, alias="sortOrder")
    created_at: datetime = Field(alias="createdAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterResponse(BaseModel):
    id: int
    volume_id: int = Field(alias="volumeId")
    title: str
    summary: Optional[str] = None
    sort_order: int = Field(default=0, alias="sortOrder")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterContentResponse(BaseModel):
    id: int
    chapter_id: int = Field(alias="chapterId")
    content: Optional[str] = None
    version: int
    created_at: datetime = Field(alias="createdAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ChapterContentDiffResponse(BaseModel):
    from_version: int = Field(alias="fromVersion")
    to_version: int = Field(alias="toVersion")
    from_content: str = Field(alias="fromContent")
    to_content: str = Field(alias="toContent")
    from_created_at: Optional[str] = Field(default=None, alias="fromCreatedAt")
    to_created_at: Optional[str] = Field(default=None, alias="toCreatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CharacterResponse(BaseModel):
    id: int
    name: str
    description: str
    book_id: Optional[int] = Field(alias="bookId")
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    aliases: Optional[List[str]] = None
    role_type: Optional[str] = Field(default=None, alias="roleType")
    status: Optional[str] = None
    relationship_chain: Optional[List[Dict[str, Any]]] = Field(default=None, alias="relationshipChain")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListCharactersResponse(BaseModel):
    characters: List[CharacterResponse]
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class BookDetailResponse(BaseModel):
    book: BookResponse
    characters: List[CharacterResponse]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CreativeSettingResponse(BaseModel):
    book_id: int = Field(alias="bookId")
    tone: Optional[str] = None
    worldview: Optional[str] = None
    writing_taboos: Optional[str] = Field(default=None, alias="writingTaboos")
    custom_dimensions: Optional[dict] = Field(default=None, alias="customDimensions")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


