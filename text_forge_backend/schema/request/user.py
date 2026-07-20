import re
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator,AliasChoices


class EmailRequest(BaseModel):
    email: EmailStr=Field(...,description="邮箱地址")

class UserLogin(BaseModel):
    """用户登录请求体"""
    user_name:str=Field(...,min_length=3,max_length=50,validation_alias=AliasChoices("username","user_name"),description="用户名（或邮箱），长度 3-50 位")
    password:str=Field(...,min_length=8,max_length=50,alias="password",description="密码，长度 8-50 位")

class UserRequest(EmailRequest):
    """用户注册请求体"""
    password:str=Field(...,min_length=8,max_length=50,description="密码，长度 8-50 位")