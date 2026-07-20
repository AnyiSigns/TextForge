from datetime import datetime
from typing import List
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, func, ForeignKey
from model.base import Base



class User(Base):
    __tablename__ = "users"

    #字段
    id:Mapped[int]=mapped_column(Integer,primary_key=True,comment="用户ID",autoincrement=True)
    user_name:Mapped[str]=mapped_column(String(64),nullable=False,default="默认用户",comment="用户名")
    hash_password:Mapped[str]=mapped_column(String(255),nullable=False,comment="密码")
    email:Mapped[str]=mapped_column(String(80),unique=True,nullable=False,index=True,comment="邮箱")

    create_at:Mapped[datetime]=mapped_column(DateTime,server_default=func.now(),comment="创建时间")
    update_at:Mapped[datetime]=mapped_column(DateTime,server_default=func.now(),onupdate=func.now(),comment="更新时间")

    tokens:Mapped[List["UserToken"]]=relationship(back_populates="users",cascade="all, delete-orphan")
    conversations:Mapped[List["Conversation"]]=relationship(back_populates="users",cascade="all, delete-orphan")    #type:ignore

class UserToken(Base):
    __tablename__ = "user_tokens"

    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True,comment="TokenID")
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"),unique=False,index=True,comment="用户ID")
    jti:Mapped[str]=mapped_column(String(50),nullable=False,comment="JWT ID")

    expired_at:Mapped[datetime]=mapped_column(DateTime,nullable=False,index=True,comment="过期时间")
    create_at:Mapped[datetime]=mapped_column(DateTime,server_default=func.now(),nullable=False,comment="创建时间")

    users:Mapped["User"]=relationship(back_populates="tokens")