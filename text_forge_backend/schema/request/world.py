from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class LocationRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    name: str
    type: str
    description: Optional[str] = None
    parent_id: Optional[int] = Field(default=None, alias="parentId")
    attributes: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(populate_by_name=True)


class TimelineEventRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    name: str
    description: Optional[str] = None
    sort_order: int = Field(default=0, alias="sortOrder")
    chapter_id: Optional[int] = Field(default=None, alias="chapterId")
    event_type: str = Field(alias="eventType")
    related_character_ids: Optional[List[int]] = Field(default=[], alias="relatedCharacterIds")
    related_location_id: Optional[int] = Field(default=None, alias="relatedLocationId")

    model_config = ConfigDict(populate_by_name=True)


class ForeshadowingRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    description: str
    status: str
    planted_at_chapter_id: Optional[int] = Field(default=None, alias="plantedAtChapterId")
    resolved_at_chapter_id: Optional[int] = Field(default=None, alias="resolvedAtChapterId")
    related_character_ids: Optional[List[int]] = Field(default=[], alias="relatedCharacterIds")
    related_event_id: Optional[int] = Field(default=None, alias="relatedEventId")
    reveal_type: Optional[str] = Field(default=None, alias="revealType")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class PlotThreadRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    name: str
    description: Optional[str] = None
    status: str
    parent_thread_id: Optional[int] = Field(default=None, alias="parentThreadId")
    type: str
    related_character_ids: Optional[List[int]] = Field(default=[], alias="relatedCharacterIds")
    start_chapter_id: Optional[int] = Field(default=None, alias="startChapterId")
    end_chapter_id: Optional[int] = Field(default=None, alias="endChapterId")
    progress_note: Optional[str] = Field(default=None, alias="progressNote")

    model_config = ConfigDict(populate_by_name=True)
