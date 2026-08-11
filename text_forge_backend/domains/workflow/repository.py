import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.workflow import Workflow
from shared.base_repo import BaseRepository


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
        """查询用户工作流列表（含全局内置模板 builtin=True）。

        内置模板稳定置顶（builtin 降序），其余按 id 排序保证列表顺序稳定。
        """
        stmt = (
            select(Workflow)
            .where((Workflow.user_id == user_id) | (Workflow.builtin == True))
            .order_by(Workflow.builtin.desc(), Workflow.id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_workflow_id(self, workflow_id: str, user_id: int):
        """根据 ID 查询单个工作流（内置模板对所有用户可见）。"""
        stmt = select(Workflow).where(
            Workflow.id == workflow_id,
            (Workflow.user_id == user_id) | (Workflow.builtin == True),
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

    async def put_workflow(self, workflow_id: str, user_id: int, update_data: dict):
        """更新工作流，不存在则创建。

        Args:
            workflow_id: 工作流 ID。
            user_id: 用户 ID。
            update_data: 更新字段字典。

        Returns:
            工作流实例，ID 不一致时返回 None。
        """
        instance = await self.get_workflow_id(workflow_id, user_id)
        if instance and getattr(instance, "builtin", False):
            # 内置模板不可原地修改：另存为用户副本（防止污染全局模板）
            copy_data = {k: v for k, v in update_data.items() if k not in ("id", "user_id")}
            copy_data["id"] = f"{workflow_id}-{uuid.uuid4().hex[:6]}"
            copy_data["name"] = (update_data.get("name") or instance.name or "") + "（副本）"
            instance = await self.create_workflow(user_id=user_id, data=copy_data)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        if instance:
            for key, value in update_data.items():
                if key in ("id", "user_id"):
                    continue
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        if not instance:
            # 新建时保证 id 与路径一致：请求体可能不带 id 字段，
            # 直接透传会导致 create_workflow 里 data["id"] KeyError
            # 或 id 不一致导致下方返回 None（404）。
            create_data = dict(update_data)
            create_data["id"] = workflow_id
            instance = await self.create_workflow(user_id=user_id, data=create_data)
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
