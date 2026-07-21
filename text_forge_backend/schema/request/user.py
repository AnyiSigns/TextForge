from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator, AliasChoices


class EmailRequest(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")


class VerifyEmailRequest(EmailRequest):
    code: str = Field(..., min_length=1, description="验证码")


class RfreshRequest(BaseModel):
    refresh_token: str


class UserLogin(EmailRequest):
    """用户登录请求体"""

    password: str = Field(
        ...,
        min_length=6,
        max_length=50,
        alias="password",
        description="密码，长度 6-50 位",
    )


class UserRequest(EmailRequest):
    """用户注册请求体"""

    user_name: str = Field(
        ..., min_length=3, max_length=50, alias="username", description="用户名"
    )
    password: str = Field(
        ..., min_length=6, max_length=50, description="密码，长度 6-50 位"
    )
