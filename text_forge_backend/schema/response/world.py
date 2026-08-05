from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LocationResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    name: str
    type: str
    description: str | None = None
    parent_id: int | None = Field(default=None, alias="parentId")
    attributes: dict[str, Any] | None = None
    position_x: float | None = Field(default=None, alias="positionX")
    position_y: float | None = Field(default=None, alias="positionY")
    background_url: str | None = Field(default=None, alias="backgroundUrl")
    alternate_of_id: int | None = Field(default=None, alias="alternateOfId")
    map_icon: str | None = Field(default=None, alias="mapIcon")
    locked: bool = Field(default=False)
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class SceneEventResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    title: str
    content: str | None = None
    sort_order: int = Field(default=0, alias="sortOrder")
    chapter_id: int | None = Field(default=None, alias="chapterId")
    event_type: str = Field(alias="eventType")
    story_ts: float = Field(default=0, alias="storyTs")
    story_label: str | None = Field(default=None, alias="storyLabel")
    location_id: int | None = Field(default=None, alias="locationId")
    character_ids: list[int] = Field(default=[], alias="characterIds")
    plot_thread_ids: list[int] = Field(default=[], alias="plotThreadIds")
    locked: bool = Field(default=False)
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ForeshadowingResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    description: str
    status: str
    planted_at_chapter_id: int | None = Field(default=None, alias="plantedAtChapterId")
    resolved_at_chapter_id: int | None = Field(default=None, alias="resolvedAtChapterId")
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    related_event_id: int | None = Field(default=None, alias="relatedEventId")
    reveal_type: str | None = Field(default=None, alias="revealType")
    notes: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class PlotThreadResponse(BaseModel):
    id: int
    book_id: int = Field(alias="bookId")
    name: str
    description: str | None = None
    status: str
    parent_thread_id: int | None = Field(default=None, alias="parentThreadId")
    type: str
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    start_chapter_id: int | None = Field(default=None, alias="startChapterId")
    end_chapter_id: int | None = Field(default=None, alias="endChapterId")
    progress_note: str | None = Field(default=None, alias="progressNote")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
