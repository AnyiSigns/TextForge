from datetime import datetime
from typing import List
from sqlalchemy import Integer, ForeignKey, String, DateTime, func,Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.model.base import Base



class Conversation(Base):
    """会话历史记录表"""
    __tablename__ = "conversations"

    id:Mapped[int]=mapped_column(Integer,primary_key=True,comment="会话历史记录id")
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"),index=True,nullable=False,comment="用户id")
    thread_id:Mapped[str]=mapped_column(String(255),nullable=False,index=True,unique=True,comment="线程")
    title:Mapped[str]=mapped_column(String(20),index=True,default="新对话",comment="标题")

    create_at:Mapped[datetime]=mapped_column(DateTime,nullable=False,server_default=func.now(),comment="会话创建时间")
    update_at:Mapped[datetime]=mapped_column(DateTime,server_default=func.now(),onupdate=func.now(),nullable=False,comment="会话更新时间")

    users:Mapped["User"]=relationship(back_populates="conversations")
    messages:Mapped[List["Message"]]=relationship(back_populates="conversations",cascade="all,delete-orphan")

class Message(Base):
    """会话内容表"""
    __tablename__ = "messages"
    id:Mapped[int]=mapped_column(Integer,primary_key=True,comment="会话内容id")
    conversation_id:Mapped[int]=mapped_column(ForeignKey("conversations.id",ondelete="CASCADE"),index=True,nullable=False,comment="历史会话记录id")
    role:Mapped[str]=mapped_column(String(20),nullable=False,index=True,comment="角色")
    content:Mapped[str]=mapped_column(Text,nullable=False,comment="回答内容")
    think:Mapped[str]=mapped_column(Text,nullable=True,comment="思考内容")

    create_at:Mapped[datetime]=mapped_column(DateTime,server_default=func.now(),nullable=False,comment="消息发送时间")

    conversations:Mapped["Conversation"]=relationship(back_populates="messages")