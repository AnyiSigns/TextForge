from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class BaseModelBasicResponse(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    adapter: Optional[str] = None
    base_url: Optional[str] = Field(default=None, alias="baseUrl")
    api_key: Optional[str] = Field(default=None, alias="apiKey")
    model_id: Optional[str] = Field(default=None, alias="modelId")
    extra: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SearchConfigResponse(BaseModel):
    provider: Optional[str] = "bocha"
    api_key: Optional[str] = None


class ModelResponse(BaseModel):
    id: Optional[int] = None
    main_config: Optional[BaseModelBasicResponse] = None
    audit_config: Optional[BaseModelBasicResponse] = None
    router_config: Optional[BaseModelBasicResponse] = None
    tool_config: Optional[BaseModelBasicResponse] = None
    vision_config: Optional[BaseModelBasicResponse] = None
    embedding_config: Optional[BaseModelBasicResponse] = None
    search_config: Optional[SearchConfigResponse] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
