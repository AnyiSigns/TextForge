from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class HistoryResponse(BaseModel):
    """对话历史会话项响应体"""
    conv_id:int=Field(...,description="会话 ID（conversation 主键）",alias="id")
    user_id:int=Field(...,description="所属用户 ID")
    title:str=Field(...,description="会话标题，默认'新对话'")
    thread_id:str=Field(...,description="LangGraph 线程 ID，用于流式对话续接上下文")
    updated_at:datetime=Field(...,description="会话最后更新时间",alias="update_at")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )

class MessagesResponse(BaseModel):
    """会话内消息列表响应体"""
    conv_id:int=Field(...,description="所属会话 ID",alias="conversation_id")
    role:str=Field(...,description="发送者角色：user / assistant")
    content:str=Field(...,description="消息正文内容")
    think:Optional[str]=Field(default=None,description="模型思考过程（reasoning_content），仅 assistant 消息可能有值")
    created_at:datetime=Field(...,description="消息创建时间",alias="create_at")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )
