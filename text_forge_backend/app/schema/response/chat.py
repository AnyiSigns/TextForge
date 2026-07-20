from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class HistoryResponse(BaseModel):
    conv_id:int=Field(...,description="会话ID",alias="id")
    user_id:int
    title:str
    thread_id:str
    updated_at:datetime=Field(...,description="更新时间",alias="update_at")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )

class MessagesResponse(BaseModel):
    conv_id:int=Field(...,description="会话ID",alias="conversation_id")
    role:str
    content:str
    think:Optional[str]=Field(default=None,description="思考过程")
    created_at:datetime=Field(...,description="创建时间",alias="create_at")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )
