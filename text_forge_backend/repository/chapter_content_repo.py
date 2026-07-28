from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import ChapterContent


class ChapterContentRepository(BaseRepository[ChapterContent]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(ChapterContent, session)

    async def list_contents(self, chapter_id: int):
        stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_latest_content(self, chapter_id: int):
        stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id)
            .order_by(ChapterContent.id.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_content(self, chapter_id: int, content: str):
        return await self.add(chapter_id=chapter_id, content=content)
