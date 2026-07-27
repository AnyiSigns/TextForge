from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.outline_repo import OutlineRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class OutlineService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.outline_repo = OutlineRepository(session)

    async def list_outlines(self, project_id: int):
        try:
            return await self.outline_repo.list_outlines(project_id)
        except Exception:
            logger.error("获取大纲列表失败", exc_info=True)
            return []

    async def get_outline(self, project_id: int, outline_id: int):
        try:
            return await self.outline_repo.project_outline_detail(
                project_id, outline_id
            )
        except Exception:
            logger.error("获取大纲失败", exc_info=True)
            return None

    async def create_outline(self, project_id: int, **data):
        try:
            return await self.outline_repo.create_outline(project_id, data)
        except Exception:
            logger.error("创建大纲失败", exc_info=True)
            return None

    async def update_outline(self, outline_id: int, **data):
        try:
            return await self.outline_repo.update_outline(outline_id, **data)
        except Exception:
            logger.error("更新大纲失败", exc_info=True)
            return None

    async def delete_outline(self, outline_id: int):
        try:
            return await self.outline_repo.delete_outline(outline_id)
        except Exception:
            logger.error("删除大纲失败", exc_info=True)
            return False


async def outline_db(db: AsyncSession = Depends(db_manager.get_db)):
    return OutlineService(db)
