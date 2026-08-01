from config.logging import get_logger
from core.exceptions import AppException
from fastapi import Depends
from shared.database import db_manager
from sqlalchemy.ext.asyncio import AsyncSession

from .chapter_repository import ChapterRepository

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
            raise AppException(status_code=500, detail="获取章列表失败", error_code="LIST_CHAPTERS_FAILED")

    async def get_chapter(self, volume_id: int, chapter_id: int):
        try:
            result = await self.chapter_repo.get_chapter(volume_id, chapter_id)
            if not result:
                raise AppException(status_code=404, detail="章节不存在", error_code="CHAPTER_NOT_FOUND")
            return result
        except AppException:
            raise
        except Exception:
            logger.error("获取章失败", exc_info=True)
            raise AppException(status_code=500, detail="获取章失败", error_code="GET_CHAPTER_FAILED")

    async def create_chapter(self, volume_id: int, **data):
        try:
            return await self.chapter_repo.create_chapter(volume_id, **data)
        except Exception:
            logger.error("创建章失败", exc_info=True)
            raise AppException(status_code=500, detail="创建章失败", error_code="CREATE_CHAPTER_FAILED")

    async def update_chapter(self, chapter_id: int, **data):
        try:
            instance = await self.chapter_repo.get(chapter_id)
            if not instance:
                raise AppException(status_code=404, detail="章节不存在", error_code="CHAPTER_NOT_FOUND")
            for key, value in data.items():
                if value is not None:
                    setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except AppException:
            raise
        except Exception:
            logger.error("更新章失败", exc_info=True)
            raise AppException(status_code=500, detail="更新章失败", error_code="UPDATE_CHAPTER_FAILED")

    async def delete_chapter(self, chapter_id: int):
        try:
            instance = await self.chapter_repo.get(chapter_id)
            if not instance:
                raise AppException(status_code=404, detail="章节不存在", error_code="CHAPTER_NOT_FOUND")
            await self.chapter_repo.delete_chapter(chapter_id)
            return True
        except AppException:
            raise
        except Exception:
            logger.error("删除章失败", exc_info=True)
            raise AppException(status_code=500, detail="删除章失败", error_code="DELETE_CHAPTER_FAILED")


async def chapter_db(db: AsyncSession = Depends(db_manager.get_db)):
    return ChapterService(db)
