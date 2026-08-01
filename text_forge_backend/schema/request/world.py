from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LocationRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int = Field(alias="bookId")
    name: str
    type: str
    description: str | None = None
    parent_id: int | None = Field(default=None, alias="parentId")
    attributes: dict[str, Any] | None = None


class TimelineEventRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int = Field(alias="bookId")
    name: str
    description: str | None = None
    sort_order: int = Field(default=0, alias="sortOrder")
    chapter_id: int | None = Field(default=None, alias="chapterId")
    event_type: str = Field(alias="eventType")
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    related_location_id: int | None = Field(default=None, alias="relatedLocationId")


class ForeshadowingRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int = Field(alias="bookId")
    description: str
    status: str
    planted_at_chapter_id: int | None = Field(default=None, alias="plantedAtChapterId")
    resolved_at_chapter_id: int | None = Field(default=None, alias="resolvedAtChapterId")
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    related_event_id: int | None = Field(default=None, alias="relatedEventId")
    reveal_type: str | None = Field(default=None, alias="revealType")
    notes: str | None = None


class PlotThreadRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

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
