from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import (
    Book,
    Chapter,
    ChapterContent,
    CreativeSetting,
    Character,
    Foreshadowing,
    Location,
    PlotThread,
    TimelineEvent,
    Volume,
)
from models.writing_session import WritingSession


def model_to_dict(obj) -> dict:
    result: dict = {}
    for key in obj.__mapper__.column_attrs.keys():
        val = getattr(obj, key)
        if isinstance(val, datetime):
            val = val.isoformat()
        result[key] = val
    return result


class SyncService:
    def __init__(self, session: AsyncSession, user_id: int):
        self.session = session
        self.user_id = user_id

    async def sync_books(self, since: datetime) -> list[Book]:
        stmt = select(Book).where(
            Book.user_id == self.user_id, Book.updated_at > since
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_characters(self, since: datetime) -> list[Character]:
        stmt = select(Character).where(
            Character.user_id == self.user_id, Character.updated_at > since
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_creative_settings(self, since: datetime) -> list[CreativeSetting]:
        stmt = (
            select(CreativeSetting)
            .join(Book, CreativeSetting.book_id == Book.id)
            .where(
                Book.user_id == self.user_id,
                CreativeSetting.updated_at > since,
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_world_locations(self, since: datetime) -> list[Location]:
        stmt = (
            select(Location)
            .join(Book, Location.book_id == Book.id)
            .where(Book.user_id == self.user_id, Location.updated_at > since)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_world_timeline_events(self, since: datetime) -> list[TimelineEvent]:
        stmt = (
            select(TimelineEvent)
            .join(Book, TimelineEvent.book_id == Book.id)
            .where(Book.user_id == self.user_id, TimelineEvent.updated_at > since)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_world_foreshadowings(self, since: datetime) -> list[Foreshadowing]:
        stmt = (
            select(Foreshadowing)
            .join(Book, Foreshadowing.book_id == Book.id)
            .where(Book.user_id == self.user_id, Foreshadowing.updated_at > since)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_world_plot_threads(self, since: datetime) -> list[PlotThread]:
        stmt = (
            select(PlotThread)
            .join(Book, PlotThread.book_id == Book.id)
            .where(Book.user_id == self.user_id, PlotThread.updated_at > since)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_chapters(self, since: datetime) -> list[Chapter]:
        stmt = (
            select(Chapter)
            .join(Volume, Chapter.volume_id == Volume.id)
            .join(Book, Volume.book_id == Book.id)
            .where(Book.user_id == self.user_id, Chapter.updated_at > since)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_chapter_contents(self, since: datetime) -> list[ChapterContent]:
        stmt = (
            select(ChapterContent)
            .join(Chapter, ChapterContent.chapter_id == Chapter.id)
            .join(Volume, Chapter.volume_id == Volume.id)
            .join(Book, Volume.book_id == Book.id)
            .where(
                Book.user_id == self.user_id,
                ChapterContent.created_at > since,
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def sync_writing_sessions(self, since: datetime) -> list[WritingSession]:
        stmt = select(WritingSession).where(
            WritingSession.user_id == self.user_id,
            WritingSession.started_at > since,
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
