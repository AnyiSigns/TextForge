from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CharacterRequest(BaseModel):
    book_id: Optional[int] = Field(default=None, alias="bookId")
    name: str
    description: str
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    aliases: Optional[List[str]] = None
    role_type: Optional[str] = Field(default=None, alias="roleType")
    status: Optional[str] = None
    relationship_chain: Optional[List[Dict[str, Any]]] = Field(default=None, alias="relationshipChain")
    model_config = {"populate_by_name": True}


class CharacterUpdateRequest(BaseModel):
    book_id: Optional[int] = Field(default=None, alias="bookId")
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    aliases: Optional[List[str]] = None
    role_type: Optional[str] = Field(default=None, alias="roleType")
    status: Optional[str] = None
    relationship_chain: Optional[List[Dict[str, Any]]] = Field(default=None, alias="relationshipChain")
    model_config = {"populate_by_name": True}
