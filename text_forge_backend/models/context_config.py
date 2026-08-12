from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class BookContextConfig(Base):
    __tablename__ = "book_context_configs"

    book_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
        comment="书籍ID"
    )
    character_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=list, comment="角色ID列表"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )
