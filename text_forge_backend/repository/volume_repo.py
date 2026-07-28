from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import Volume


class VolumeRepository(BaseRepository[Volume]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Volume, session)

    async def list_volumes(self, book_id: int):
        stmt = select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_volume(self, book_id: int, volume_id: int):
        stmt = select(Volume).where(Volume.book_id == book_id, Volume.id == volume_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, volume_id: int):
        return await self.get(volume_id)

    async def create_volume(self, book_id: int, **kwargs):
        return await self.add(book_id=book_id, **kwargs)

    async def update_volume(self, volume_id: int, **kwargs):
        instance = await self.get(volume_id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_volume(self, volume_id: int):
        return await self.delete(volume_id)
