from pydantic import BaseModel, Field, ConfigDict
from typing import Optional


class BaseModelBasicRequest(BaseModel):
    name: str
    adapter: str
    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(alias="apiKey")
    model_id: str = Field(alias="modelId")
    extra: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SearchConfigRequest(BaseModel):
    provider: Optional[str] = "bocha"
    api_key: Optional[str] = None


class ModelRequest(BaseModel):
    main_config: Optional[BaseModelBasicRequest] = None
    audit_config: Optional[BaseModelBasicRequest] = None
    router_config: Optional[BaseModelBasicRequest] = None
    tool_config: Optional[BaseModelBasicRequest] = None
    vision_config: Optional[BaseModelBasicRequest] = None
    embedding_config: Optional[BaseModelBasicRequest] = None
    search_config: Optional[SearchConfigRequest] = None
