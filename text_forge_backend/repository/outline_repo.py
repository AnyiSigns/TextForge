from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.project import Outline


class OutlineRepository(BaseRepository[Outline]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Outline, session)

    async def list_outlines(self, project_id: int):
        stmt = select(Outline).where(Outline.project_id == project_id).order_by(Outline.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def project_outline_detail(self, project_id: int, outline_id: int):
        stmt = select(Outline).where(Outline.project_id == project_id, Outline.id == outline_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_outline(self, project_id: int, data):
        payload = data.get('data', data) if isinstance(data, dict) else data
        instance = await self.add(project_id=project_id, data=payload)
        return instance

    async def update_outline(self, outline_id: int, **kwargs):
        data = kwargs.get('data', kwargs)
        if isinstance(data, dict):
            data = data.get('data', data)
        kwargs['data'] = data
        return await self.update(outline_id, **kwargs)

    async def delete_outline(self, outline_id: int):
        return await self.delete(outline_id)
