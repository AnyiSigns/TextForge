from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class AgentWriteAudit(Base):
    """写操作审计：门控审批与全部写工具执行留痕。

    支撑回溯与回滚定位；ChapterContent 已版本化，update_entity 等改字段操作无留痕，
    本表补齐该缺口。
    """

    __tablename__ = "agent_write_audits"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True, comment="审计ID"
    )
    thread_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True, comment="会话线程ID"
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
    tool_name: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="工具名"
    )
    operation: Mapped[str] = mapped_column(
        String(64), nullable=False, default="", comment="写操作键"
    )
    args_summary: Mapped[str] = mapped_column(
        Text, default="", comment="参数摘要(JSON)"
    )
    decision: Mapped[str] = mapped_column(
        String(16), nullable=False, default="", comment="审批决策 accept/retry/edit/terminate"
    )
    result: Mapped[str] = mapped_column(
        String(64), default="", comment="执行结果 ok/error/cancelled"
    )
    meta: Mapped[dict] = mapped_column(JSONB, default={}, comment="附加元数据")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
