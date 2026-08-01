from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class WritingSession(Base):
    __tablename__ = "writing_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="写作会话ID")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="用户ID")
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True, comment="书籍ID")
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True, comment="章节ID")
    words_written: Mapped[int] = mapped_column(Integer, default=0, comment="写作字数")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, comment="持续时长(秒)")
    character_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="关联角色ID列表")
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="开始时间")
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="结束时间")
