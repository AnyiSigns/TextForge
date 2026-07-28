from sqlalchemy import select

from repository.base_repo import BaseRepository
from model.model import Workflow
from sqlalchemy.ext.asyncio import AsyncSession


class WorkflowRepository(BaseRepository[Workflow]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Workflow, session)

    async def get_list_workflow(self, user_id: int):
        stmt = select(Workflow).where(Workflow.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_workflow_id(self, workflow_id: str, user_id: int):
        stmt = select(Workflow).where(
            Workflow.id == workflow_id, Workflow.user_id == user_id
        )
        instance = await self.session.execute(stmt)
        return instance.scalar_one_or_none()
