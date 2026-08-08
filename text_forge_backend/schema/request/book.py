
from pydantic import BaseModel, ConfigDict, Field


class BookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    description: str | None = None
    genre: str | None = None
    time_unit: str | None = Field(default=None, alias="timeUnit")
    epoch_label: str | None = Field(default=None, alias="epochLabel")


class UpdateBookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    workflow_id: str | None = Field(default=None, alias="workflowId")
    title: str | None = None
    description: str | None = None
    genre: str | None = None
    total_word_goal: int | None = Field(default=None, alias="totalWordGoal")
    pinned: bool | None = Field(default=None, alias="pinned")
    time_unit: str | None = Field(default=None, alias="timeUnit")
    epoch_label: str | None = Field(default=None, alias="epochLabel")


class VolumeRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: str | None = None


class VolumeUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str | None = None
    summary: str | None = None


class ChapterRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: str | None = None
    locked: bool | None = None
    generation_batch: int | None = Field(default=None, alias="generationBatch")


class ChapterUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str | None = None
    summary: str | None = None
    locked: bool | None = None
    generation_batch: int | None = Field(default=None, alias="generationBatch")


class SceneEventRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    content: str | None = None
    character_ids: list[int] = Field(default_factory=list, alias="characterIds")
    plot_thread_ids: list[int] = Field(default_factory=list, alias="plotThreadIds")
    locked: bool | None = None


class ChapterContentRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    content: str


class LockChapterRequest(BaseModel):
    """章节锁定/解锁请求体（lock 字段可选，缺省时切换当前状态）。"""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    locked: bool | None = None


class CreativeSettingRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    tone: str | None = None
    worldview: str | None = None
    writing_taboos: str | None = Field(default=None, alias="writingTaboos")
    custom_dimensions: dict | None = Field(default=None, alias="customDimensions")
