from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.book import Book, Character
    from models.conversation import Conversation
    from models.document import Document
    from models.workflow import Workflow


class User(Base):
    __tablename__ = "users"

    # 字段
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, comment="用户ID", autoincrement=True
    )
    user_name: Mapped[str] = mapped_column(
        String(64), nullable=False, default="默认用户", comment="用户名"
    )
    hash_password: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="密码"
    )
    email: Mapped[str] = mapped_column(
        String(80), unique=True, nullable=False, index=True, comment="邮箱"
    )
    avatar: Mapped[str] = mapped_column(String(255), nullable=True, comment="头像URL")

    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, comment="是否验证"
    )

    create_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    update_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    tokens: Mapped[list["UserToken"]] = relationship(
        back_populates="users", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="users", cascade="all, delete-orphan")  # type: ignore
    books: Mapped[list["Book"]] = relationship(
        back_populates="user", cascade="all,delete-orphan"
    )
    characters: Mapped[list["Character"]] = relationship(
        back_populates="user", cascade="all,delete-orphan"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        back_populates="users", cascade="all,delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="users", cascade="all,delete-orphan"
    )


class UserToken(Base):
    __tablename__ = "user_tokens"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True, comment="TokenID"
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=False,
        index=True,
        comment="用户ID",
    )
    jti: Mapped[str] = mapped_column(String(50), nullable=False, comment="JWT ID")

    expired_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, index=True, comment="过期时间"
    )
    create_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, comment="创建时间"
    )

    users: Mapped["User"] = relationship(back_populates="tokens")
