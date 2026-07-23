from typing import List, Optional
from pydantic import BaseModel, Field


class ProjectRequest(BaseModel):
    title: str
    description: Optional[str] = None
    genre: Optional[str] = None
    version: Optional[int] = None


class UpdateProjectRequest(BaseModel):
    workflow_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None


class StepIdRequest(BaseModel):
    content: str


class StepConfirm(BaseModel):
    step_id: int


class SectionsRequest(BaseModel):
    id: int
    title: str
    content: str
    pinned: Optional[bool] = None


class BriefRequest(BaseModel):
    project_id: int = Field(..., alias="projectId")
    genre: str
    worldview: str
    tone: str
    forbidden: str
    style_guide: str = Field(alias="styleGuide")
    word_count_goal: Optional[int] = Field(default=None, alias="wordCountGoal")
    daily_word_count_goal: Optional[int] = Field(
        default=None, alias="dailyWordCountGoal"
    )
    sections: List[SectionsRequest]
