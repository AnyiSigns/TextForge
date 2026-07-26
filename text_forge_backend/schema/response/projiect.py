from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ProjectResponse(BaseModel):
    id: int
    title: str
    status: str
    genre: Optional[str] = None
    description: Optional[str] = None
    pinned: Optional[bool] = False
    workflow_id: Optional[str] = Field(alias="workflowId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ProjectVersionResponse(BaseModel):
    project: ProjectResponse
    version: Optional[int]


class StepResponse(BaseModel):
    id: int
    agent: str
    agentName: Optional[str] = None
    content: str
    status: str
    node_id: Optional[str] = Field(default=None, alias="nodeId")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class StepUpdateResponse(BaseModel):
    step: StepResponse
    model_config = ConfigDict(from_attributes=True)


class CharacterResponse(BaseModel):
    id: int
    name: str
    description: str
    project_id: Optional[int] = Field(alias="projectId")
    avatar: Optional[str] = None
    aliases: Optional[List[str]] = None
    role: Optional[str] = None
    status: Optional[str] = None
    current_profile: Optional[str] = Field(default=None, alias="currentProfile")
    custom_role: Optional[str] = Field(default=None, alias="customRole")
    relationships: Optional[List[Dict[str, Any]]] = None
    images: Optional[Dict[str, Any]] = None
    reference_images: Optional[Dict[str, Any]] = None
    reference_image: Optional[str] = None
    image_seed: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ListCharactersResponse(BaseModel):
    characters: List[CharacterResponse]
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProjectDetailResponse(BaseModel):
    project: ProjectResponse
    steps: List[StepResponse]
    characters: List[CharacterResponse]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
