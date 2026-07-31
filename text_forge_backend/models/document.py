from datetime import datetime
from typing import List
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from models.base import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB


class Document(Base):

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    author: Mapped[str] = mapped_column(String(128), nullable=True, index=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=True)
    file_md5: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, server_default="personal", index=True)
    metadatas: Mapped[dict] = mapped_column(JSONB, default=dict, comment="元数据")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    users: Mapped["User"] = relationship(back_populates="documents")
    chunks: Mapped[List["Chunk"]] = relationship(
        back_populates="documents", cascade="all,delete-orphan"
    )


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Vector] = mapped_column(Vector(None), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    documents: Mapped["Document"] = relationship(back_populates="chunks")
    metadatas: Mapped[dict] = mapped_column(
        JSONB, nullable=True, default={}, comment="上下文信息,页码等"
    )

    __table_args__ = (Index("idx_chunks_doc_id", "doc_id"),)
