from datetime import datetime
from textwrap import indent
from typing import List, Optional
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from model.base import Base
import enum


class StatusEnum(str, enum.Enum):
    DRAFT = "draft"
    GENERATING = "generating"
    COMPLETED = "completed"
    PAUSED = "paused"


class Project(Base):
    """项目表"""

    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="项目ID")
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
        comment="所属用户ID",
    )
    title: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True, comment="项目标题"
    )
    description: Mapped[str] = mapped_column(Text, comment="项目描述")
    genre: Mapped[str] = mapped_column(String(128), comment="项目类型")
    status: Mapped[StatusEnum] = mapped_column(
        Enum(StatusEnum, native_enum=False),
        default=StatusEnum.DRAFT,
        nullable=False,
    )
    pinned: Mapped[bool] = mapped_column(
        Boolean, default=False, index=True, comment="置顶"
    )
    workflow_id: Mapped[str] = mapped_column(
        String(128), nullable=True, index=True, comment="流水线"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=True)

    users: Mapped["User"] = relationship(back_populates="projects")
    steps: Mapped[List["Step"]] = relationship(
        back_populates="projects", cascade="all,delete-orphan"
    )
    characters: Mapped[List["Character"]] = relationship(
        back_populates="projects", cascade="all,delete-orphan"
    )
    briefs: Mapped[Optional["Brief"]] = relationship(
        back_populates="projects", cascade="all,delete-orphan"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Step(Base):
    __tablename__ = "steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    agent_name: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[StatusEnum] = mapped_column(
        Enum(StatusEnum, native_enum=False),
        default=StatusEnum.DRAFT,
        nullable=False,
    )
    node_id: Mapped[str] = mapped_column(String(128))
    projects: Mapped["Project"] = relationship(back_populates="steps")


class Character(Base):
    __tablename__ = "characters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    avatar: Mapped[str] = mapped_column(String(255))
    aliases: Mapped[dict] = mapped_column(JSONB, default=dict)
    role: Mapped[str] = mapped_column(String(255))
    status: Mapped[StatusEnum] = mapped_column(
        Enum(StatusEnum, native_enum=False), default=StatusEnum.DRAFT, nullable=False
    )
    current_profile: Mapped[str] = mapped_column(Text)
    custom_role: Mapped[str] = mapped_column(String(255))
    relationships: Mapped[dict] = mapped_column(JSONB, default=dict)
    images: Mapped[dict] = mapped_column(JSONB, default=dict)
    reference_images: Mapped[dict] = mapped_column(JSONB, default=dict)
    reference_image: Mapped[str] = mapped_column(String(255))
    image_seed: Mapped[int] = mapped_column(Integer)

    users: Mapped["User"] = relationship(back_populates="characters")
    projects: Mapped["Project"] = relationship(back_populates="characters")


class Brief(Base):
    __tablename__ = "briefs"
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    genre: Mapped[str] = mapped_column(String(64))
    worldview: Mapped[str] = mapped_column(Text, comment="世界观")
    tone: Mapped[str] = mapped_column(String(255), comment="文风/基调")
    forbidden: Mapped[str] = mapped_column(Text, comment="创作禁忌")
    style_guide: Mapped[str] = mapped_column(Text, comment="风格指南")
    default_vision_model: Mapped[str] = mapped_column(String(128), nullable=True)
    default_style: Mapped[str] = mapped_column(
        String(128), comment="图片风格", nullable=True
    )
    word_count_goal: Mapped[int] = mapped_column(
        Integer, nullable=True, comment="字数目标"
    )
    daily_word_count_goal: Mapped[int] = mapped_column(
        Integer, nullable=True, comment="每日字数目标"
    )
    sections: Mapped[dict] = mapped_column(JSONB, default=dict)
    field_origins: Mapped[dict] = mapped_column(JSONB, default=dict)

    projects: Mapped[Optional["Project"]] = relationship(back_populates="briefs")


class ModelConfig(Base):
    __tablename__ = "model_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    main_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    compression: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    router_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    tool_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    vision_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    embedding_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)

    users: Mapped["User"] = relationship(back_populates="model_configs")


class Workflow(Base):
    __tablename__ = "workflows"
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(128), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=True)
    edges: Mapped[dict] = mapped_column(JSONB, nullable=True)

    users: Mapped["User"] = relationship(back_populates="workflows")
