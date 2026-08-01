
from pydantic import BaseModel, ConfigDict, Field


class BaseModelBasicRequest(BaseModel):
    name: str
    adapter: str
    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(alias="apiKey")
    model_id: str = Field(alias="modelId")
    extra: dict | None = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SearchConfigRequest(BaseModel):
    provider: str | None = "bocha"
    api_key: str | None = None


class ModelRequest(BaseModel):
    main_config: BaseModelBasicRequest | None = None
    audit_config: BaseModelBasicRequest | None = None
    router_config: BaseModelBasicRequest | None = None
    tool_config: BaseModelBasicRequest | None = None
    vision_config: BaseModelBasicRequest | None = None
    embedding_config: BaseModelBasicRequest | None = None
    search_config: SearchConfigRequest | None = None
