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

    async def create_workflow(self, user_id: int, data: dict):
        instance = await self.add(
            user_id=user_id,
            id=data["id"],
            name=data["name"],
            description=data["description"],
            nodes=data["nodes"],
            edges=data["edges"],
        )
        return instance

    async def put_workflow(self, workflow_id: str, user_id: int, updata: dict):
        instance = await self.get_workflow_id(workflow_id, user_id)
        if instance:
            for key, value in updata.items():
                if key in ("id", "user_id"):
                    continue
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        if not instance:
            instance = await self.create_workflow(user_id=user_id, data=updata)
        if instance.id != workflow_id:
            return None
        return instance

    async def delete_user_in_workflow(self, workflow_id: str):
        status = await self.delete(workflow_id)
        return status
