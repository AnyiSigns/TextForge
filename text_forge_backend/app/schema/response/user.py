from typing import Optional
from pydantic import BaseModel, Field,EmailStr
from pydantic.config import ConfigDict



class UserRes(BaseModel):
    """用户响应"""
    user_id:int=Field(...,alias="id")
    user_name:str=Field(...,alias="user_name")
    email:EmailStr
    phone:Optional[str]=Field(default=None,description="手机号")

    model_config = ConfigDict(
        from_attributes=True
    )

class TokenRes(BaseModel):
    access_token:str
    token_type:str="bearer"