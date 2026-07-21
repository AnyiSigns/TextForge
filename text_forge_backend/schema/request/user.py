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
    new_password: str = Field(..., alias="newPassword", min_length=6, max_length=50, description="新密码")
