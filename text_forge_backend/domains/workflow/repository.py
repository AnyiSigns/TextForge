from sqlalchemy import select

from domains.shared.base_repo import BaseRepository
from models.model import Workflow
from sqlalchemy.ext.asyncio import AsyncSession


class WorkflowRepository(BaseRepository[Workflow]):
    """工作流仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 WorkflowRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(Workflow, session)

    async def get_list_workflow(self, user_id: int):
        """查询用户工作流列表。

        Args:
            user_id: 用户 ID。

        Returns:
            工作流实例列表。
        """
        stmt = select(Workflow).where(Workflow.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_workflow_id(self, workflow_id: str, user_id: int):
        """根据 ID 查询单个工作流。

        Args:
            workflow_id: 工作流 ID。
            user_id: 用户 ID。

        Returns:
            工作流实例，不存在返回 None。
        """
        stmt = select(Workflow).where(
            Workflow.id == workflow_id, Workflow.user_id == user_id
        )
        instance = await self.session.execute(stmt)
        return instance.scalar_one_or_none()

    async def create_workflow(self, user_id: int, data: dict):
        """创建工作流。

        Args:
            user_id: 用户 ID。
            data: 工作流数据，需包含 id、name、description。

        Returns:
            新创建的工作流实例。
        """
        instance = await self.add(
            user_id=user_id,
            id=data["id"],
            name=data["name"],
            description=data["description"],
            nodes=data.get("nodes"),
            edges=data.get("edges"),
        )
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def put_workflow(self, workflow_id: str, user_id: int, updata: dict):
        """更新工作流，不存在则创建。

        Args:
            workflow_id: 工作流 ID。
            user_id: 用户 ID。
            updata: 更新字段字典。

        Returns:
            工作流实例，ID 不一致时返回 None。
        """
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
        """删除工作流。

        Args:
            workflow_id: 工作流 ID。

        Returns:
            BaseRepository.delete 的返回值。
        """
        status = await self.delete(workflow_id)
        return status
