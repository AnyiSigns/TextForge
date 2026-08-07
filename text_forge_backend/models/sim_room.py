"""角色模拟房间 / 支线系统数据模型"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class SimRoom(Base):
    __tablename__ = "sim_rooms"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="房间ID")
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属书籍ID")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="创建用户ID")
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="房间名称")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="房间描述")
    summary: Mapped[str] = mapped_column(Text, nullable=True, comment="对话结束后的摘要")
    status: Mapped[str] = mapped_column(String(20), default="active", comment="房间状态: active/archived")
    round_count: Mapped[int] = mapped_column(Integer, default=0, comment="已经历的对话轮数")
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, comment="关联地点ID")
    related_event_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="关联时间线事件ID列表")
    related_foreshadowing_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="关联伏笔ID列表")
    related_plot_thread_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="关联剧情线索ID列表")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    participants: Mapped[list["SimParticipant"]] = relationship(back_populates="room", cascade="all,delete-orphan")
    messages: Mapped[list["SimMessage"]] = relationship(back_populates="room", cascade="all,delete-orphan")
    branches: Mapped[list["SimBranch"]] = relationship(back_populates="room", cascade="all,delete-orphan")


class SimParticipant(Base):
    __tablename__ = "sim_participants"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="参与者ID")
    room_id: Mapped[int] = mapped_column(ForeignKey("sim_rooms.id", ondelete="CASCADE"), nullable=False, index=True, comment="房间ID")
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="实体类型: user/character/scene_npc")
    entity_id: Mapped[int] = mapped_column(Integer, nullable=True, comment="实体ID(user/character表)或NULL(scene_npc)")
    role_label: Mapped[str] = mapped_column(String(100), nullable=False, comment="在房间中的显示名")
    personality_override: Mapped[str] = mapped_column(Text, nullable=True, comment="临时覆盖的性格描述")

    room: Mapped["SimRoom"] = relationship(back_populates="participants")


class SimMessage(Base):
    __tablename__ = "sim_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="消息ID")
    room_id: Mapped[int] = mapped_column(ForeignKey("sim_rooms.id", ondelete="CASCADE"), nullable=False, index=True, comment="房间ID")
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="发送者类型: user/character/scene_npc/system")
    sender_id: Mapped[int] = mapped_column(Integer, nullable=True, comment="发送者实体ID")
    sender_label: Mapped[str] = mapped_column(String(100), nullable=True, comment="发送者显示名")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="消息内容")
    message_type: Mapped[str] = mapped_column(String(20), default="dialogue", comment="消息类型: dialogue/narration/action/inner_thought/scene")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")

    room: Mapped["SimRoom"] = relationship(back_populates="messages")


class SimBranch(Base):
    __tablename__ = "sim_branches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="支线ID")
    room_id: Mapped[int] = mapped_column(ForeignKey("sim_rooms.id", ondelete="CASCADE"), nullable=False, index=True, comment="房间ID")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="支线标题")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="支线内容")
    branch_type: Mapped[str] = mapped_column(String(30), nullable=False, comment="支线类型: backstory/relationship/plot-thread/foreshadow-fill/voice-test")
    related_character_ids: Mapped[list] = mapped_column(JSONB, default=[], comment="关联角色ID列表")
    related_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, comment="关联地点ID")
    related_event_id: Mapped[int] = mapped_column(ForeignKey("scene_events.id", ondelete="SET NULL"), nullable=True, comment="关联事件ID")
    related_foreshadowing_id: Mapped[int] = mapped_column(ForeignKey("foreshadowings.id", ondelete="SET NULL"), nullable=True, comment="关联伏笔ID")
    compressed_context: Mapped[str] = mapped_column(Text, nullable=True, comment="压缩后的上下文（注入Agent用）")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")

    room: Mapped["SimRoom"] = relationship(back_populates="branches")
