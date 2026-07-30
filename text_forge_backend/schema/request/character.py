from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class CharacterRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: Optional[int] = Field(default=None, alias="bookId")
    name: str
    description: str
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    aliases: Optional[List[str]] = None
    role_type: Optional[str] = Field(default=None, alias="roleType")
    status: Optional[str] = None
    relationship_chain: Optional[List[Dict[str, Any]]] = Field(default=None, alias="relationshipChain")


class CharacterUpdateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: Optional[int] = Field(default=None, alias="bookId")
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    aliases: Optional[List[str]] = None
    role_type: Optional[str] = Field(default=None, alias="roleType")
    status: Optional[str] = None
    relationship_chain: Optional[List[Dict[str, Any]]] = Field(default=None, alias="relationshipChain")
