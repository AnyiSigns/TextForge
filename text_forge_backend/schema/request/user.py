from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ProfileRequest(BaseModel):
    user_name: str = Field(..., alias="username")
    email: EmailStr
    code: Optional[str] = None


class ChangePasswordReq(BaseModel):
    old_password: str = Field(..., alias="oldPassword")
    new_password: str = Field(..., alias="newPassword")


class ChangePasswordByEmailReq(BaseModel):
    code: str = Field(..., min_length=1, description="验证码")
    new_password: str = Field(
        ..., alias="newPassword", min_length=6, max_length=50, description="新密码"
    )


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


class CompressionRequest(BaseModelBasicRequest):
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
    compression: Optional[CompressionRequest] = None
    router_config: Optional[RouterRequest] = None
    tool_config: Optional[ToolRequest] = None
    vision_config: Optional[VsionRequest] = None
    embedding_config: Optional[EembeddingRequest] = None
