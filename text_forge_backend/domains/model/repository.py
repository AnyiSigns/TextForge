from domains.shared.base_repo import BaseRepository
from models.model import ModelConfig
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


class ModelConfRepository(BaseRepository[ModelConfig]):
    """用户模型配置仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 ModelConfRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(ModelConfig, session)

    async def create_model_config(self, user_id: int, model_conf: dict):
        """创建用户模型配置。

        Args:
            user_id: 用户 ID。
            model_conf: 模型配置字典，需包含 main_config、audit_config 等字段。

        Returns:
            新创建的 ModelConfig 实例。
        """
        instance = await self.add(
            user_id=user_id,
            main_config=model_conf["main_config"],
            audit_config=model_conf["audit_config"],
            router_config=model_conf["router_config"],
            tool_config=model_conf["tool_config"],
            vision_config=model_conf["vision_config"],
            embedding_config=model_conf["embedding_config"],
        )
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def update_model_config(self, user_id: int, model_conf: dict):
        """更新用户模型配置，不存在则创建。

        Args:
            user_id: 用户 ID。
            model_conf: 模型配置字典。

        Returns:
            ModelConfig 实例。
        """
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in model_conf.items():
                if key in ("id", "user_id"):
                    continue
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        if not instance:
            instance = await self.create_model_config(user_id, model_conf)
        return instance

    async def query_user_model(self, user_id: int) -> ModelConfig | None:
        """查询用户模型配置。

        Args:
            user_id: 用户 ID。

        Returns:
            ModelConfig 实例，不存在返回 None。
        """
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        instance = await self.session.execute(stmt)
        return instance.scalar_one_or_none()
