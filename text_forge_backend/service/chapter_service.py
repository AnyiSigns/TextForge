from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.chapter_repo import ChapterRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ChapterService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.chapter_repo = ChapterRepository(session)

    async def list_chapters(self, volume_id: int):
        try:
            return await self.chapter_repo.list_chapters(volume_id)
        except Exception:
            logger.error("获取章列表失败", exc_info=True)
            return []

    async def get_chapter(self, volume_id: int, chapter_id: int):
        try:
            return await self.chapter_repo.get_chapter(volume_id, chapter_id)
        except Exception:
            logger.error("获取章失败", exc_info=True)
            return None

    async def create_chapter(self, volume_id: int, **data):
        try:
            return await self.chapter_repo.create_chapter(volume_id, **data)
        except Exception:
            logger.error("创建章失败", exc_info=True)
            return None

    async def update_chapter(self, chapter_id: int, **data):
        try:
            return await self.chapter_repo.update_chapter(chapter_id, **data)
        except Exception:
            logger.error("更新章失败", exc_info=True)
            return None

    async def delete_chapter(self, chapter_id: int):
        try:
            return await self.chapter_repo.delete_chapter(chapter_id)
        except Exception:
            logger.error("删除章失败", exc_info=True)
            return False


async def chapter_db(db: AsyncSession = Depends(db_manager.get_db)):
    return ChapterService(db)
