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
    position_x: float | None = Field(default=None, alias="positionX")
    position_y: float | None = Field(default=None, alias="positionY")
    background_url: str | None = Field(default=None, alias="backgroundUrl")
    alternate_of_id: int | None = Field(default=None, alias="alternateOfId")
    map_icon: str | None = Field(default=None, alias="mapIcon")
    locked: bool = Field(default=False)


class SceneEventRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

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
    resolved_foreshadowing_ids: list[int] = Field(default=[], alias="resolvedForeshadowingIds")
    completed_plot_thread_ids: list[int] = Field(default=[], alias="completedPlotThreadIds")
    locked: bool = Field(default=False)


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
    type: str | None = Field(default=None)
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


# 以下为更新（PATCH/PUT 局部更新）专用的可选模型。
# book_id 通过 Query 参数传入，不需要出现在请求体中；其余字段均可选，
# 配合路由中的 exclude_unset=True 仅更新客户端实际提交的字段。
class LocationUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    name: str | None = None
    type: str | None = None
    description: str | None = None
    parent_id: int | None = Field(default=None, alias="parentId")
    attributes: dict[str, Any] | None = None
    position_x: float | None = Field(default=None, alias="positionX")
    position_y: float | None = Field(default=None, alias="positionY")
    background_url: str | None = Field(default=None, alias="backgroundUrl")
    alternate_of_id: int | None = Field(default=None, alias="alternateOfId")
    map_icon: str | None = Field(default=None, alias="mapIcon")
    locked: bool | None = None


class SceneEventUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str | None = None
    content: str | None = None
    sort_order: int | None = Field(default=None, alias="sortOrder")
    chapter_id: int | None = Field(default=None, alias="chapterId")
    event_type: str | None = Field(default=None, alias="eventType")
    story_ts: float | None = Field(default=None, alias="storyTs")
    story_label: str | None = Field(default=None, alias="storyLabel")
    location_id: int | None = Field(default=None, alias="locationId")
    character_ids: list[int] | None = Field(default=None, alias="characterIds")
    plot_thread_ids: list[int] | None = Field(default=None, alias="plotThreadIds")
    resolved_foreshadowing_ids: list[int] | None = Field(default=None, alias="resolvedForeshadowingIds")
    completed_plot_thread_ids: list[int] | None = Field(default=None, alias="completedPlotThreadIds")
    locked: bool | None = None


class ForeshadowingUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    description: str | None = None
    status: str | None = None
    planted_at_chapter_id: int | None = Field(default=None, alias="plantedAtChapterId")
    resolved_at_chapter_id: int | None = Field(default=None, alias="resolvedAtChapterId")
    related_character_ids: list[int] | None = Field(default=None, alias="relatedCharacterIds")
    related_event_id: int | None = Field(default=None, alias="relatedEventId")
    reveal_type: str | None = Field(default=None, alias="revealType")
    type: str | None = Field(default=None)
    notes: str | None = None


class PlotThreadUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    name: str | None = None
    description: str | None = None
    status: str | None = None
    parent_thread_id: int | None = Field(default=None, alias="parentThreadId")
    type: str | None = None
    related_character_ids: list[int] | None = Field(default=None, alias="relatedCharacterIds")
    start_chapter_id: int | None = Field(default=None, alias="startChapterId")
    end_chapter_id: int | None = Field(default=None, alias="endChapterId")
    progress_note: str | None = Field(default=None, alias="progressNote")
