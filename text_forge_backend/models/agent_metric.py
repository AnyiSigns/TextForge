from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class AgentTurnMetric(Base):
    """Agent 回合指标（任务 28 指标层）：每回合耗时 / LLM 调用 / 工具成败 / 压缩 / 审批。

    用于开放项（子图 step cap、模型分层、重试策略）的决策数据来源。
    """

    __tablename__ = "agent_turn_metrics"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True, comment="指标ID"
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
    thread_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True, comment="会话线程ID"
    )
    subgraph: Mapped[str] = mapped_column(
        String(32), nullable=False, default="", comment="当前创作子图"
    )
    duration_ms: Mapped[float] = mapped_column(
        Float, default=0, comment="回合耗时(毫秒)"
    )
    llm_calls: Mapped[int] = mapped_column(Integer, default=0, comment="LLM 调用次数")
    tool_calls: Mapped[int] = mapped_column(Integer, default=0, comment="工具调用次数")
    tool_success: Mapped[int] = mapped_column(
        Integer, default=0, comment="工具成功次数"
    )
    tool_fail: Mapped[int] = mapped_column(Integer, default=0, comment="工具失败次数")
    compress_count: Mapped[int] = mapped_column(
        Integer, default=0, comment="压缩次数"
    )
    approval_count: Mapped[int] = mapped_column(
        Integer, default=0, comment="审批卡弹卡次数"
    )
    approval_accept: Mapped[int] = mapped_column(
        Integer, default=0, comment="审批通过（accept）次数"
    )
    details: Mapped[dict] = mapped_column(
        JSONB, default={}, comment="按子图分布等明细"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
