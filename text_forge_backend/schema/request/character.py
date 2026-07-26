from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class CharacterRequest(BaseModel):
    project_id: Optional[int] = Field(default=None, alias="projectId")
    name: str
    description: str
    role: str = ""
    aliases: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    current_profile: str = Field(default="", alias="currentProfile")
    custom_role: str = Field(default="", alias="customRole")
    relationships: Optional[Dict[str, Any]] = None
    images: Optional[Dict[str, Any]] = None
    reference_images: Optional[Dict[str, Any]] = None
    reference_image: str = ""
    image_seed: int = 0
    model_config = {"populate_by_name": True}


class CharacterUpdateRequest(BaseModel):
    project_id: Optional[int] = Field(default=None, alias="projectId")
    name: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    aliases: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    current_profile: Optional[str] = Field(default=None, alias="currentProfile")
    custom_role: Optional[str] = Field(default=None, alias="customRole")
    relationships: Optional[Dict[str, Any]] = None
    images: Optional[Dict[str, Any]] = None
    reference_images: Optional[Dict[str, Any]] = None
    reference_image: Optional[str] = None
    image_seed: Optional[int] = None
    model_config = {"populate_by_name": True}
