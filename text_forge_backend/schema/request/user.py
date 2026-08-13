
from pydantic import BaseModel, EmailStr, Field


class ProfileRequest(BaseModel):
    user_name: str = Field(..., alias="username")
    email: EmailStr
    code: str | None = None


class ChangePasswordReq(BaseModel):
    old_password: str = Field(..., alias="oldPassword")
    new_password: str = Field(..., alias="newPassword")


class ChangePasswordByEmailReq(BaseModel):
    code: str = Field(..., min_length=1, description="验证码")
    new_password: str = Field(
        ..., alias="newPassword", min_length=6, max_length=50, description="新密码"
    )


class SendCodeRequest(BaseModel):
    email: EmailStr | None = None


class DeleteAccountReq(BaseModel):
    password: str = Field(..., min_length=1, description="登录密码（注销确认）")
    access_token: str | None = Field(
        default=None, description="当前 access token（用于注销后立即加入黑名单）"
    )
