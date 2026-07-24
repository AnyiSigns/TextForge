from pydantic import BaseModel, ConfigDict, EmailStr, Field
from schema.response.auth import UserResponse
from typing import Optional


class ProfileResponse(BaseModel):
    user: UserResponse


class BaseModelBasicResponse(BaseModel):
    id: str
    name: str
    adapter: str
    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(alias="apiKey")
    model_id: str = Field(alias="modelId")
    extra: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class MainConfResponse(BaseModelBasicResponse):
    pass


class CompressionResponse(BaseModelBasicResponse):
    pass


class RouterResponse(BaseModelBasicResponse):
    pass


class ToolResponse(BaseModelBasicResponse):
    pass


class VisionResponse(BaseModelBasicResponse):
    pass


class EmbeddingResponse(BaseModelBasicResponse):
    pass


class ModelResponse(BaseModel):
    id: Optional[int] = None
    main_config: Optional[MainConfResponse] = None
    compression: Optional[CompressionResponse] = None
    router_config: Optional[RouterResponse] = None
    tool_config: Optional[ToolResponse] = None
    vision_config: Optional[VisionResponse] = None
    embedding_config: Optional[EmbeddingResponse] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
