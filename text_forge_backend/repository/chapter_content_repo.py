from sqlalchemy import select, func
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import ChapterContent


class ChapterContentRepository(BaseRepository[ChapterContent]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(ChapterContent, session)

    async def list_contents(self, chapter_id: int):
        stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.version)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_latest_content(self, chapter_id: int):
        stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id)
            .order_by(ChapterContent.version.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_content_by_version(self, chapter_id: int, version: int):
        stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == version)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_content(self, chapter_id: int, content: str):
        next_version = await self._next_version(chapter_id)
        return await self.add(chapter_id=chapter_id, content=content, version=next_version)

    async def _next_version(self, chapter_id: int) -> int:
        stmt = select(func.coalesce(func.max(ChapterContent.version), 0)).where(ChapterContent.chapter_id == chapter_id)
        result = await self.session.execute(stmt)
        current = result.scalar_one() or 0
        return current + 1
