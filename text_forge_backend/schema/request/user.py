from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ProfileRequest(BaseModel):
    user_name: str = Field(..., alias="username")
    email: EmailStr


class ChangePasswordReq(BaseModel):
    old_password: str = Field(..., alias="oldPassword")
    new_password: str = Field(..., alias="newPassword")
