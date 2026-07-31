from datetime import datetime
from sqlalchemy import ForeignKey, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from models.base import Base


class BookContextConfig(Base):
    __tablename__ = "book_context_configs"

    book_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    character_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=[]
    )
    chapter_content_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=[]
    )
    chapter_summary_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=[]
    )
    volume_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=[]
    )
    outline_node_ids: Mapped[list[int]] = mapped_column(
        PG_ARRAY(Integer), nullable=False, default=[]
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
