from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class BookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    description: Optional[str] = None
    genre: Optional[str] = None


class UpdateBookRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    workflow_id: Optional[str] = Field(default=None, alias="workflowId")
    title: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    total_word_goal: Optional[int] = Field(default=None, alias="totalWordGoal")


class VolumeRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: Optional[str] = None


class ChapterRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    title: str
    summary: Optional[str] = None


class ChapterContentRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    content: str


class SectionsRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    title: str
    content: str
    pinned: Optional[bool] = None


class CreativeSettingRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    tone: Optional[str] = None
    worldview: Optional[str] = None
    writing_taboos: Optional[str] = Field(default=None, alias="writingTaboos")
    custom_dimensions: Optional[dict] = Field(default=None, alias="customDimensions")
