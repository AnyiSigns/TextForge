from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.volume_repo import VolumeRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class VolumeService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.volume_repo = VolumeRepository(session)

    async def list_volumes(self, book_id: int):
        try:
            return await self.volume_repo.list_volumes(book_id)
        except Exception:
            logger.error("获取卷列表失败", exc_info=True)
            return []

    async def get_volume(self, book_id: int, volume_id: int):
        try:
            return await self.volume_repo.get_volume(book_id, volume_id)
        except Exception:
            logger.error("获取卷失败", exc_info=True)
            return None

    async def create_volume(self, book_id: int, **data):
        try:
            return await self.volume_repo.create_volume(book_id, **data)
        except Exception:
            logger.error("创建卷失败", exc_info=True)
            return None

    async def update_volume(self, volume_id: int, **data):
        try:
            return await self.volume_repo.update_volume(volume_id, **data)
        except Exception:
            logger.error("更新卷失败", exc_info=True)
            return None

    async def delete_volume(self, volume_id: int):
        try:
            return await self.volume_repo.delete_volume(volume_id)
        except Exception:
            logger.error("删除卷失败", exc_info=True)
            return False


async def volume_db(db: AsyncSession = Depends(db_manager.get_db)):
    return VolumeService(db)
