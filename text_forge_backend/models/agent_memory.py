from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class AgentMemory(Base):
    __tablename__ = "agent_memories"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="记忆ID"
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="用户ID",
    )
    book_id: Mapped[int | None] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="书籍ID",
    )
    memory_type: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True, comment="记忆类型"
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="记忆内容")
    related_chapter_id: Mapped[int | None] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联章节ID",
    )
    related_character_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关联角色ID列表"
    )
    priority: Mapped[int] = mapped_column(Integer, default=5, comment="优先级")
    source: Mapped[str] = mapped_column(String(64), nullable=False, comment="来源")
    # 向量维度不固定：用户可配置不同嵌入模型（512/768/1024/1536 等），
    # 用 Vector(None) 让 pgvector 按实际写入维度存储，避免维度不匹配报错。
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(None), nullable=True, comment="向量嵌入"
    )
    meta: Mapped[dict] = mapped_column(JSONB, default={}, comment="元数据")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )
