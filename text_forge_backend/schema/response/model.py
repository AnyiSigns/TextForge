
from pydantic import BaseModel, ConfigDict, Field


class BaseModelBasicResponse(BaseModel):
    id: str | None = None
    name: str | None = None
    adapter: str | None = None
    base_url: str | None = Field(default=None, alias="baseUrl")
    api_key: str | None = Field(default=None, alias="apiKey")
    model_id: str | None = Field(default=None, alias="modelId")
    extra: dict | None = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SearchConfigResponse(BaseModel):
    provider: str | None = "bocha"
    api_key: str | None = None


class ModelResponse(BaseModel):
    id: int | None = None
    main_config: BaseModelBasicResponse | None = None
    audit_config: BaseModelBasicResponse | None = None
    router_config: BaseModelBasicResponse | None = None
    tool_config: BaseModelBasicResponse | None = None
    vision_config: BaseModelBasicResponse | None = None
    embedding_config: BaseModelBasicResponse | None = None
    search_config: SearchConfigResponse | None = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
