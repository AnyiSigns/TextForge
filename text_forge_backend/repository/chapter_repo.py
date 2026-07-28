from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import Chapter


class ChapterRepository(BaseRepository[Chapter]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Chapter, session)

    async def list_chapters(self, volume_id: int):
        stmt = select(Chapter).where(Chapter.volume_id == volume_id).order_by(Chapter.sort_order, Chapter.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_chapter(self, volume_id: int, chapter_id: int):
        stmt = select(Chapter).where(Chapter.volume_id == volume_id, Chapter.id == chapter_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, chapter_id: int):
        return await self.get(chapter_id)

    async def create_chapter(self, volume_id: int, **kwargs):
        return await self.add(volume_id=volume_id, **kwargs)

    async def update_chapter(self, chapter_id: int, **kwargs):
        instance = await self.get(chapter_id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_chapter(self, chapter_id: int):
        return await self.delete(chapter_id)
