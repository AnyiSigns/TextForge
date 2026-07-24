from typing import Annotated
from infrastructure.database import db_manager
from fastapi import Depends

from utils.logger import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from repository.model_repo import ModelConfRepository

logger = get_logger(__name__)


class ModelService:
    def __init__(self, session: AsyncSession):
        self.model_repo = ModelConfRepository(session)

    async def save_user_model(self, model_conf: dict, user_id: int):
        try:
            instance = await self.model_repo.update_model_config(user_id, model_conf)
            return instance
        except Exception:
            logger.error("模型配置更新错误", exc_info=True)
            return None

    async def query_user_model(self, user_id: int):
        try:
            instance = await self.model_repo.query_user_model(user_id)
            if instance:
                return instance
            return None
        except Exception:
            logger.error("模型配置异常", exc_info=True)
            return None


async def model_db(session: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    return ModelService(session)
