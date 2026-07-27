from pydantic import BaseModel, Field, ConfigDict
from typing import Optional


class BaseModelBasicRequest(BaseModel):
    id: str
    name: str
    adapter: str
    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(alias="apiKey")
    model_id: str = Field(alias="modelId")
    extra: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class MainConfRequest(BaseModelBasicRequest):
    pass


class AuditConfigRequest(BaseModelBasicRequest):
    pass


class RouterRequest(BaseModelBasicRequest):
    pass


class ToolRequest(BaseModelBasicRequest):
    pass


class VsionRequest(BaseModelBasicRequest):
    pass


class EembeddingRequest(BaseModelBasicRequest):
    pass


class ModelRequest(BaseModel):
    main_config: Optional[MainConfRequest] = None
    audit_config: Optional[AuditConfigRequest] = None
    router_config: Optional[RouterRequest] = None
    tool_config: Optional[ToolRequest] = None
    vision_config: Optional[VsionRequest] = None
    embedding_config: Optional[EembeddingRequest] = None
