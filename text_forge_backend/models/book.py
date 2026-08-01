from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    genre: Mapped[str] = mapped_column(String(128), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(128), nullable=True, index=True)
    total_word_goal: Mapped[int] = mapped_column(Integer, default=0)
    current_word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="books")
    creative_setting: Mapped["CreativeSetting"] = relationship(back_populates="book", cascade="all,delete-orphan")
    volumes: Mapped[list["Volume"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    characters: Mapped[list["Character"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    outlines: Mapped[list["Outline"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    locations: Mapped[list["Location"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    timeline_events: Mapped[list["TimelineEvent"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    foreshadowings: Mapped[list["Foreshadowing"]] = relationship(back_populates="book", cascade="all,delete-orphan")
    plot_threads: Mapped[list["PlotThread"]] = relationship(back_populates="book", cascade="all,delete-orphan")


class CreativeSetting(Base):
    __tablename__ = "creative_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), unique=True, nullable=False)
    tone: Mapped[str] = mapped_column(Text, nullable=True)
    worldview: Mapped[str] = mapped_column(Text, nullable=True)
    writing_taboos: Mapped[str] = mapped_column(Text, nullable=True)
    custom_dimensions: Mapped[dict] = mapped_column(JSONB, default={})
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="creative_setting")


class Volume(Base):
    __tablename__ = "volumes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    book: Mapped["Book"] = relationship(back_populates="volumes")
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="volume", cascade="all,delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    volume_id: Mapped[int] = mapped_column(ForeignKey("volumes.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    volume: Mapped["Volume"] = relationship(back_populates="chapters")
    contents: Mapped[list["ChapterContent"]] = relationship(back_populates="chapter", cascade="all,delete-orphan")


class ChapterContent(Base):
    __tablename__ = "chapter_contents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    chapter: Mapped["Chapter"] = relationship(back_populates="contents")


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    aliases: Mapped[list] = mapped_column(JSONB, default=[])
    description: Mapped[str] = mapped_column(Text, nullable=True)
    role_type: Mapped[str] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(255), nullable=True)
    relationship_chain: Mapped[list] = mapped_column(JSONB, default=[])
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="characters")
    user: Mapped["User"] = relationship(back_populates="characters")


class Outline(Base):
    __tablename__ = "outlines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("outlines.id", ondelete="CASCADE"), nullable=True)
    target_volume_id: Mapped[int] = mapped_column(ForeignKey("volumes.id"), nullable=True)
    target_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"), nullable=True)
    node_type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="outlines")
    parent: Mapped[Optional["Outline"]] = relationship(back_populates="children", remote_side="Outline.id")
    children: Mapped[list["Outline"]] = relationship(back_populates="parent", cascade="all,delete-orphan")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    attributes: Mapped[dict] = mapped_column(JSONB, default={})
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="locations")
    parent: Mapped[Optional["Location"]] = relationship(back_populates="children", remote_side="Location.id")
    children: Mapped[list["Location"]] = relationship(back_populates="parent", cascade="all,delete-orphan")


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    related_character_ids: Mapped[list] = mapped_column(JSONB, default=[])
    related_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="timeline_events")


class Foreshadowing(Base):
    __tablename__ = "foreshadowings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    planted_at_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    resolved_at_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    related_character_ids: Mapped[list] = mapped_column(JSONB, default=[])
    related_event_id: Mapped[int] = mapped_column(ForeignKey("timeline_events.id", ondelete="SET NULL"), nullable=True)
    reveal_type: Mapped[str] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="foreshadowings")


class PlotThread(Base):
    __tablename__ = "plot_threads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_thread_id: Mapped[int] = mapped_column(ForeignKey("plot_threads.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    related_character_ids: Mapped[list] = mapped_column(JSONB, default=[])
    start_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    end_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    progress_note: Mapped[str] = mapped_column(Text, nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    book: Mapped["Book"] = relationship(back_populates="plot_threads")
    parent: Mapped[Optional["PlotThread"]] = relationship(back_populates="children", remote_side="PlotThread.id")
    children: Mapped[list["PlotThread"]] = relationship(back_populates="parent", cascade="all,delete-orphan")
