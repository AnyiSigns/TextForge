
from pydantic import BaseModel, ConfigDict, Field


class BookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    description: str | None = None
    genre: str | None = None


class UpdateBookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    workflow_id: str | None = Field(default=None, alias="workflowId")
    title: str | None = None
    description: str | None = None
    genre: str | None = None
    total_word_goal: int | None = Field(default=None, alias="totalWordGoal")


class VolumeRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: str | None = None


class ChapterRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: str | None = None
    character_ids: list[int] = Field(default_factory=list, alias="characterIds")
    locked: bool | None = None


class SceneEventRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    content: str | None = None
    character_ids: list[int] = Field(default_factory=list, alias="characterIds")
    locked: bool | None = None


class ChapterContentRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    content: str


class SectionsRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    title: str
    content: str
    pinned: bool | None = None


class CreativeSettingRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    tone: str | None = None
    worldview: str | None = None
    writing_taboos: str | None = Field(default=None, alias="writingTaboos")
    custom_dimensions: dict | None = Field(default=None, alias="customDimensions")
