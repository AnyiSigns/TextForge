from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Document(Base):

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="文档ID")
    file_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True, comment="文件名")
    author: Mapped[str] = mapped_column(String(128), nullable=True, index=True, comment="作者")
    file_type: Mapped[str] = mapped_column(String(50), nullable=True, comment="文件类型")
    file_md5: Mapped[str] = mapped_column(String(255), nullable=False, index=True, comment="文件MD5")
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, comment="用户ID"
    )
    file_size: Mapped[int] = mapped_column(Integer, nullable=True, comment="文件大小(字节)")
    scope: Mapped[str] = mapped_column(String(32), nullable=False, server_default="personal", index=True, comment="范围")
    metadatas: Mapped[dict] = mapped_column(JSONB, default=dict, comment="元数据")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")

    users: Mapped["User"] = relationship(back_populates="documents")
    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="documents", cascade="all,delete-orphan"
    )


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="分块ID")
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True, comment="文档ID"
    )
    chunk_index: Mapped[int] = mapped_column(Integer, comment="分块序号")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="分块内容")
    embedding: Mapped[Vector] = mapped_column(Vector(None), nullable=True, comment="向量嵌入")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")

    documents: Mapped["Document"] = relationship(back_populates="chunks")
    metadatas: Mapped[dict] = mapped_column(
        JSONB, nullable=True, default={}, comment="上下文信息,页码等"
    )

    __table_args__ = (Index("idx_chunks_doc_id", "doc_id"),)
