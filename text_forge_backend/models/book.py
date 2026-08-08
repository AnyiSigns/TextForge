from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
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

if TYPE_CHECKING:
    from models.user import User


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="书籍ID"
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="用户ID",
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="书名")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="书籍简介")
    genre: Mapped[str] = mapped_column(String(128), nullable=True, comment="分类")
    pinned: Mapped[bool] = mapped_column(
        Boolean, default=False, index=True, comment="是否置顶"
    )
    workflow_id: Mapped[str] = mapped_column(
        String(128), nullable=True, index=True, comment="工作流ID"
    )
    total_word_goal: Mapped[int] = mapped_column(
        Integer, default=0, comment="总字数目标"
    )
    current_word_count: Mapped[int] = mapped_column(
        Integer, default=0, comment="当前字数"
    )
    time_unit: Mapped[str] = mapped_column(
        String(20), default="day", nullable=False, comment="时间轴单位"
    )
    epoch_label: Mapped[str] = mapped_column(
        String(100), nullable=True, comment="纪元标签"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    user: Mapped["User"] = relationship(back_populates="books")
    creative_setting: Mapped["CreativeSetting"] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    volumes: Mapped[list["Volume"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    characters: Mapped[list["Character"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    locations: Mapped[list["Location"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    scene_events: Mapped[list["SceneEvent"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    foreshadowings: Mapped[list["Foreshadowing"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )
    plot_threads: Mapped[list["PlotThread"]] = relationship(
        back_populates="book", cascade="all,delete-orphan"
    )


class CreativeSetting(Base):
    __tablename__ = "creative_settings"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="创意设定ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        comment="书籍ID",
    )
    tone: Mapped[str] = mapped_column(Text, nullable=True, comment="语调/文风")
    worldview: Mapped[str] = mapped_column(Text, nullable=True, comment="世界观")
    writing_taboos: Mapped[str] = mapped_column(Text, nullable=True, comment="写作禁忌")
    custom_dimensions: Mapped[dict] = mapped_column(
        JSONB, default={}, comment="自定义维度"
    )
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="creative_setting")


class Volume(Base):
    __tablename__ = "volumes"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="卷ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="书籍ID",
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False, comment="卷标题")
    summary: Mapped[str] = mapped_column(Text, nullable=True, comment="卷简介")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )

    book: Mapped["Book"] = relationship(back_populates="volumes")
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="volume", cascade="all,delete-orphan"
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="章节ID"
    )
    volume_id: Mapped[int] = mapped_column(
        ForeignKey("volumes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属卷ID",
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="标题")
    summary: Mapped[str] = mapped_column(Text, nullable=True, comment="章节摘要")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    generation_batch: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, comment="生成批次号：初始化=1，每次追加递增"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    volume: Mapped["Volume"] = relationship(back_populates="chapters")
    scene_events: Mapped[list["SceneEvent"]] = relationship(
        back_populates="chapter", cascade="all,delete-orphan"
    )
    contents: Mapped[list["ChapterContent"]] = relationship(
        back_populates="chapter", cascade="all,delete-orphan"
    )

    @property
    def character_ids(self) -> list[int]:
        """出场角色ID列表（派生）：本章所有场景事件关联角色的并集。

        角色关联以场景（SceneEvent）为唯一来源，章节不直接存储。
        """
        ids: list[int] = []
        for e in self.scene_events or []:
            for cid in e.character_ids or []:
                if cid not in ids:
                    ids.append(cid)
        return ids


class ChapterContent(Base):
    __tablename__ = "chapter_contents"
    # 同一章节内版本号唯一：并发写入（agent 工具 + 用户手动保存）时防止产生重复版本
    __table_args__ = (
        UniqueConstraint("chapter_id", "version", name="uq_chapter_contents_chapter_version"),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="章节内容ID"
    )
    chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="章节ID",
    )
    content: Mapped[str] = mapped_column(Text, nullable=True, comment="章节内容")
    version: Mapped[int] = mapped_column(Integer, default=1, comment="版本号")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )

    chapter: Mapped["Chapter"] = relationship(back_populates="contents")


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="角色ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属书籍ID",
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="创建用户ID",
    )
    avatar_url: Mapped[str] = mapped_column(
        String(500), nullable=True, comment="头像URL"
    )
    name: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, comment="角色名称"
    )
    aliases: Mapped[list] = mapped_column(JSONB, default=[], comment="别名列表")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="角色描述")
    role_type: Mapped[str] = mapped_column(
        String(128), nullable=True, comment="角色类型"
    )
    status: Mapped[str] = mapped_column(String(255), nullable=True, comment="角色状态")
    relationship_chain: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关系链"
    )
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    custom_fields: Mapped[dict] = mapped_column(
        JSONB, default={}, comment="自定义属性字段（如功法/武器/物品等）"
    )
    spawn_location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        comment="角色初次出场地点",
    )
    base_location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        comment="角色当前地点",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="characters")
    user: Mapped["User"] = relationship(back_populates="characters")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="地点ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属书籍ID",
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="地点名称")
    type: Mapped[str] = mapped_column(String(50), nullable=False, comment="地点类型")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="地点描述")
    parent_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        comment="父地点ID",
    )
    attributes: Mapped[dict] = mapped_column(JSONB, default={}, comment="属性")
    position_x: Mapped[float] = mapped_column(
        Float, nullable=True, comment="在父级底图上的X坐标 (0-1)"
    )
    position_y: Mapped[float] = mapped_column(
        Float, nullable=True, comment="在父级底图上的Y坐标 (0-1)"
    )
    background_url: Mapped[str] = mapped_column(
        String(500), nullable=True, comment="缩放进入的底图URL"
    )
    alternate_of_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        comment="平行世界指向的原版地点",
    )
    map_icon: Mapped[str] = mapped_column(
        String(100), nullable=True, comment="自定义地图标记图标"
    )
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="locations")
    parent: Mapped[Optional["Location"]] = relationship(
        back_populates="children",
        remote_side="Location.id",
        foreign_keys="Location.parent_id",
    )
    children: Mapped[list["Location"]] = relationship(
        back_populates="parent",
        cascade="all,delete-orphan",
        foreign_keys="Location.parent_id",
    )


class SceneEvent(Base):
    """场景事件（合并 chapter_nodes + timeline_events）"""

    __tablename__ = "scene_events"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="事件ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属书籍ID",
    )
    chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="所属章节ID",
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="事件标题")
    content: Mapped[str] = mapped_column(Text, nullable=True, comment="场景级摘要")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="章节内排序")
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="scene / event / milestone"
    )
    story_ts: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="故事时间偏移量"
    )
    story_label: Mapped[str] = mapped_column(
        String(200), nullable=True, comment="自定义时间标签"
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联地点ID",
    )
    character_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关联角色ID列表"
    )
    plot_thread_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关联情节线ID列表"
    )
    resolved_foreshadowing_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="本场景揭示的伏笔ID列表"
    )
    completed_plot_thread_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="本场景完结的情节线ID列表"
    )
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="scene_events")
    chapter: Mapped[Optional["Chapter"]] = relationship(back_populates="scene_events")


class Foreshadowing(Base):
    __tablename__ = "foreshadowings"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="伏笔ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属书籍ID",
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, comment="伏笔描述")
    status: Mapped[str] = mapped_column(String(20), nullable=False, comment="伏笔状态")
    planted_at_chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        comment="埋下伏笔的章节ID",
    )
    resolved_at_chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        comment="回收伏笔的章节ID",
    )
    related_character_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关联角色ID列表"
    )
    related_event_id: Mapped[int] = mapped_column(
        ForeignKey("scene_events.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联场景事件ID",
    )
    reveal_type: Mapped[str] = mapped_column(
        String(50), nullable=True, comment="揭示方式"
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True, comment="备注")
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="foreshadowings")


class PlotThread(Base):
    __tablename__ = "plot_threads"

    id: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=True, comment="剧情线索ID"
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属书籍ID",
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="线索名称")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="线索描述")
    status: Mapped[str] = mapped_column(String(20), nullable=False, comment="线索状态")
    parent_thread_id: Mapped[int] = mapped_column(
        ForeignKey("plot_threads.id", ondelete="SET NULL"),
        nullable=True,
        comment="父线索ID",
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False, comment="线索类型")
    related_character_ids: Mapped[list] = mapped_column(
        JSONB, default=[], comment="关联角色ID列表"
    )
    start_chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        comment="开始章节ID",
    )
    end_chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
        comment="结束章节ID",
    )
    progress_note: Mapped[str] = mapped_column(Text, nullable=True, comment="进度备注")
    locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否锁定"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    book: Mapped["Book"] = relationship(back_populates="plot_threads")
    parent: Mapped[Optional["PlotThread"]] = relationship(
        back_populates="children", remote_side="PlotThread.id"
    )
    children: Mapped[list["PlotThread"]] = relationship(
        back_populates="parent", cascade="all,delete-orphan"
    )
