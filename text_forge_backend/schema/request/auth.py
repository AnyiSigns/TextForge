from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    email: EmailStr = Field(..., description="邮箱地址")


class VerifyEmailRequest(EmailRequest):
    code: str = Field(..., min_length=1, description="验证码")


class RefreshRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    refresh_token: str | None = None  # HttpOnly cookie 化后由后端从 cookie 读取；body 兼容旧客户端/测试
    access_token: str | None = None  # 登出时可选携带：将其加入黑名单立即失效


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
