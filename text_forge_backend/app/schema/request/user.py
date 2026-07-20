import re
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator,AliasChoices



class UserLogin(BaseModel):
    """用户登录"""
    user_name:str=Field(...,min_length=3,max_length=50,validation_alias=AliasChoices("username","user_name"),description="用户名")
    password:str=Field(...,min_length=8,max_length=50,alias="password",description="密码")

class UserRequest(BaseModel):
    """用户注册"""
    user_name:str=Field(...,min_length=3,max_length=50,validation_alias=AliasChoices("username","user_name"),description="用户名")
    password:str=Field(...,min_length=8,max_length=50,description="密码")
    email:EmailStr=Field(...,description="邮箱")
    phone:Optional[str]=Field(default=None,description="手机号")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r"^\+?[0-9]{5,20}$", v):
            raise ValueError("手机号格式不正确，请输入有效的手机号码")
        return v