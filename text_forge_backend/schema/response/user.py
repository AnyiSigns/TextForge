from typing import Optional
from pydantic import BaseModel, Field,EmailStr
from pydantic.config import ConfigDict

class EmailResponse(BaseModel):
    email: EmailStr=Field(...,description="邮箱地址")

class RegisterResponse(EmailResponse):
    """注册响应体"""
    message:str

class TokenRes(BaseModel):
    """登录响应体（JWT）"""
    access_token:str=Field(...,description="JWT access token，有效期 7 天，需在后续请求的 Authorization: Bearer <token> 中使用")
    token_type:str=Field(default="bearer",description="令牌类型，固定为 bearer")