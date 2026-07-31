from typing import Annotated
from shared.database import db_manager
from fastapi import Depends

from config.logging import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from domains.model.repository import ModelConfRepository

logger = get_logger(__name__)


class ModelService:
    """模型配置服务层。

    负责用户模型配置的查询、更新与统一加载。
    """

    def __init__(self, session: AsyncSession):
        """初始化 ModelService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.model_repo = ModelConfRepository(session)

    async def save_user_model(self, model_conf: dict, user_id: int):
        """保存或更新用户模型配置。

        Args:
            model_conf: 模型配置字典。
            user_id: 用户 ID。

        Returns:
            更新后的 ModelConfig 实例，失败返回 None。
        """
        try:
            instance = await self.model_repo.update_model_config(user_id, model_conf)
            return instance
        except Exception:
            logger.error("模型配置更新错误", exc_info=True)
            return None

    async def query_user_model(self, user_id: int):
        """查询用户模型配置。

        Args:
            user_id: 用户 ID。

        Returns:
            ModelConfig 实例，不存在返回 None。
        """
        try:
            instance = await self.model_repo.query_user_model(user_id)
            if instance:
                return instance
            return None
        except Exception:
            logger.error("模型配置异常", exc_info=True)
            return None

    @staticmethod
    async def get_user_model_config(session: AsyncSession, user_id: int) -> dict:
        """获取用户模型配置字典。

        从数据库查询用户模型配置并转换为统一字典格式，
        供 API 层和 Workflow Executor 共享使用。

        Args:
            session: SQLAlchemy 异步会话。
            user_id: 用户 ID。

        Returns:
            包含 main_config、audit_config、router_config、tool_config、
            vision_config、embedding_config 的字典，无配置返回空字典。
        """
        repo = ModelConfRepository(session)
        instance = await repo.query_user_model(user_id)
        if not instance:
            return {}
        return {
            "user_id": instance.user_id,
            "main_config": instance.main_config or {},
            "audit_config": instance.audit_config or {},
            "router_config": instance.router_config or {},
            "tool_config": instance.tool_config or {},
            "vision_config": instance.vision_config or {},
            "embedding_config": instance.embedding_config or {},
        }


async def model_db(session: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    """FastAPI 依赖注入：提供 ModelService 实例。"""
    return ModelService(session)
