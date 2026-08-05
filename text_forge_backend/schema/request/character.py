from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CharacterRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int | None = Field(default=None, alias="bookId")
    name: str
    description: str
    avatar_url: str | None = Field(default=None, alias="avatarUrl")
    aliases: list[str] | None = None
    role_type: str | None = Field(default=None, alias="roleType")
    status: str | None = None
    relationship_chain: list[dict[str, Any]] | None = Field(default=None, alias="relationshipChain")
    locked: bool | None = Field(default=None)
    custom_fields: dict[str, Any] | None = Field(default=None, alias="customFields")
    spawn_location_id: int | None = Field(default=None, alias="spawnLocationId")
    base_location_id: int | None = Field(default=None, alias="baseLocationId")


class CharacterUpdateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    book_id: int | None = Field(default=None, alias="bookId")
    name: str | None = None
    description: str | None = None
    avatar_url: str | None = Field(default=None, alias="avatarUrl")
    aliases: list[str] | None = None
    role_type: str | None = Field(default=None, alias="roleType")
    status: str | None = None
    relationship_chain: list[dict[str, Any]] | None = Field(default=None, alias="relationshipChain")
    locked: bool | None = Field(default=None)
    custom_fields: dict[str, Any] | None = Field(default=None, alias="customFields")
    spawn_location_id: int | None = Field(default=None, alias="spawnLocationId")
    base_location_id: int | None = Field(default=None, alias="baseLocationId")
