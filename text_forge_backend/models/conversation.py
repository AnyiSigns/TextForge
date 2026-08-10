from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.user import User


class Conversation(Base):
    """会话历史记录表"""

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="会话历史记录id")
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
        comment="用户id",
    )
    book_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=True, index=True, comment="关联书籍id"
    )
    type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="chat", index=True, comment="会话类型: chat/user_agent"
    )
    thread_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True, unique=True, comment="线程"
    )
    title: Mapped[str] = mapped_column(
        String(20), index=True, default="新对话", comment="标题"
    )

    create_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), comment="会话创建时间"
    )
    update_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="会话更新时间"
    )

    users: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversations", cascade="all,delete-orphan"
    )


class Message(Base):
    """会话内容表"""

    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="会话内容id")
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
        comment="历史会话记录id",
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True, comment="角色"
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="回答内容")
    think: Mapped[str] = mapped_column(Text, nullable=True, comment="思考内容")
    # 任务 32：事件卡片消息（review-card 等）持久化。type 为卡片类型，
    # token 存整张卡片的 JSON（前端据此还原审核卡）。
    type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="", comment="消息类型（空为普通消息，review-card/propose-cards 等为卡片）"
    )
    token: Mapped[str | None] = mapped_column(Text, nullable=True, comment="卡片消息的 JSON 载荷")

    create_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, comment="消息发送时间"
    )

    conversations: Mapped["Conversation"] = relationship(back_populates="messages")
