from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import Outline
import copy


class OutlineRepository(BaseRepository[Outline]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Outline, session)

    async def list_outlines(self, book_id: int):
        stmt = select(Outline).where(Outline.book_id == book_id).order_by(Outline.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def book_outline_detail(self, book_id: int, outline_id: int):
        stmt = select(Outline).where(Outline.book_id == book_id, Outline.id == outline_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_outline(self, book_id: int, data):
        payload = data.get('data', data) if isinstance(data, dict) else data
        instance = await self.add(book_id=book_id, data=payload)
        return instance

    async def update_outline(self, outline_id: int, **kwargs):
        instance = await self.get(outline_id)
        if not instance:
            return None
        if 'chapter_id' in kwargs and 'summary' in kwargs:
            chapter_id = kwargs.pop('chapter_id')
            summary = kwargs.pop('summary')
            data = copy.deepcopy(instance.data or [])
            for vol in data:
                if isinstance(vol, dict):
                    for ch in (vol.get('chapters') or []):
                        if ch.get('id') == chapter_id:
                            ch['summary'] = summary
                            break
            kwargs['data'] = data
        if 'data' in kwargs:
            data = kwargs.get('data')
            if isinstance(data, dict):
                data = data.get('data', data)
            kwargs['data'] = data
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_outline(self, outline_id: int):
        return await self.delete(outline_id)
