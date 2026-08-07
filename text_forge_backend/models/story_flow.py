"""剧情流（交互式章节剧情推演）数据模型"""
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class StoryFlow(Base):
    """剧情流会话表：一次交互式章节剧情推演对应一条会话。"""

    __tablename__ = "story_flows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="剧情流ID")
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属书籍ID")
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属章节ID")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="创建用户ID")
    status: Mapped[str] = mapped_column(String(20), default="active", comment="会话状态: active/completed")
    anchor_event_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="锚点事件ID快照（生成时锁定；无事件时为空列表）")
    current_event_index: Mapped[int] = mapped_column(Integer, default=0, comment="当前推进到的事件下标，-1 表示实时生成模式")
    view_character_id: Mapped[int] = mapped_column(Integer, nullable=True, comment="视角角色ID（不加DB外键，角色可能被删除，应用层校验）")
    round_count: Mapped[int] = mapped_column(Integer, default=0, comment="已生成的场景数")
    summary: Mapped[str] = mapped_column(Text, nullable=True, comment="推演摘要（提交agent时生成，留档）")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    nodes: Mapped[list["StoryFlowNode"]] = relationship(back_populates="flow", cascade="all,delete-orphan")


class StoryFlowNode(Base):
    """剧情流场景节点表：一个场景（叙事+选项）对应一行，决策链由此派生。"""

    __tablename__ = "story_flow_nodes"
    __table_args__ = (
        UniqueConstraint("flow_id", "seq", name="uq_story_flow_nodes_flow_seq"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="节点ID")
    flow_id: Mapped[int] = mapped_column(ForeignKey("story_flows.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属剧情流ID")
    seq: Mapped[int] = mapped_column(Integer, nullable=False, comment="节点序号（1 起，flow_id+seq 联合唯一防重复插入）")
    anchored_event_id: Mapped[int] = mapped_column(Integer, nullable=True, comment="锚定的事件ID，实时生成模式为 null")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="场景标题")
    narration: Mapped[str] = mapped_column(Text, nullable=False, comment="叙事文本（LLM 生成原文，含视角角色原名）")
    options: Mapped[list] = mapped_column(JSONB, default=[], comment="预设选项数组 [{\"text\": ...}]")
    chosen_option: Mapped[str] = mapped_column(Text, nullable=True, comment="用户选择的选项文本（自定义输入原样存）")
    location_name: Mapped[str] = mapped_column(String(200), nullable=True, comment="场景地点名（展示用）")
    character_names: Mapped[list] = mapped_column(JSONB, default=[], comment="出场角色名列表（展示用）")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")

    flow: Mapped["StoryFlow"] = relationship(back_populates="nodes")
