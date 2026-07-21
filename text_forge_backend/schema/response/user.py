from datetime import datetime
from typing import Optional
from click import File
from pydantic import BaseModel, Field, EmailStr
from pydantic.config import ConfigDict


class EmailResponse(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")


class UserResponse(EmailResponse):
    user_id: int = Field(..., alias="id", description="用户id")
    user_name: str = Field(..., alias="username", description="用户名")
    avatar: Optional[str]
    is_verified: bool = Field(..., alias="isVerified", description="是否验证")
    create_at: datetime = Field(..., alias="createdAt", description="创建时间")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class TokenRes(BaseModel):
    """登录响应体（JWT）"""

    access_token: str = Field(
        ...,
        description="JWT access token，有效期 15分钟，需在后续请求的 Authorization: Bearer <token> 中使用",
    )
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型，固定为 bearer")

    user: UserResponse
