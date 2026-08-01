from config.logging import get_logger
from core.exceptions import AppException
from fastapi import Depends
from shared.database import db_manager
from sqlalchemy.ext.asyncio import AsyncSession

from .chapter_content_repository import ChapterContentRepository

logger = get_logger(__name__)


class ChapterContentService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.content_repo = ChapterContentRepository(session)

    async def list_contents(self, chapter_id: int):
        try:
            return await self.content_repo.list_contents(chapter_id)
        except Exception:
            logger.error("获取章节正文列表失败", exc_info=True)
            raise AppException(status_code=500, detail="获取章节正文列表失败", error_code="LIST_CONTENTS_FAILED")

    async def get_latest_content(self, chapter_id: int):
        try:
            result = await self.content_repo.get_latest_content(chapter_id)
            if not result:
                raise AppException(status_code=404, detail="正文不存在", error_code="CONTENT_NOT_FOUND")
            return result
        except AppException:
            raise
        except Exception:
            logger.error("获取最新正文失败", exc_info=True)
            raise AppException(status_code=500, detail="获取最新正文失败", error_code="GET_LATEST_CONTENT_FAILED")

    async def create_content(self, chapter_id: int, content: str):
        try:
            return await self.content_repo.create_content(chapter_id, content)
        except Exception:
            logger.error("创建正文失败", exc_info=True)
            raise AppException(status_code=500, detail="创建正文失败", error_code="CREATE_CONTENT_FAILED")

    async def get_content_by_version(self, chapter_id: int, version: int):
        try:
            result = await self.content_repo.get_content_by_version(chapter_id, version)
            if not result:
                raise AppException(status_code=404, detail="指定版本正文不存在", error_code="CONTENT_VERSION_NOT_FOUND")
            return result
        except AppException:
            raise
        except Exception:
            logger.error("获取指定版本正文失败", exc_info=True)
            raise AppException(status_code=500, detail="获取指定版本正文失败", error_code="GET_CONTENT_BY_VERSION_FAILED")

    async def diff_versions(self, chapter_id: int, from_version: int, to_version: int):
        try:
            from_item = await self.content_repo.get_content_by_version(chapter_id, from_version)
            to_item = await self.content_repo.get_content_by_version(chapter_id, to_version)
            if not from_item or not to_item:
                raise AppException(status_code=404, detail="版本不存在", error_code="CONTENT_VERSION_NOT_FOUND")
            return {
                "from_version": from_item.version,
                "to_version": to_item.version,
                "from_content": from_item.content or "",
                "to_content": to_item.content or "",
                "from_created_at": from_item.created_at.isoformat() if from_item.created_at else None,
                "to_created_at": to_item.created_at.isoformat() if to_item.created_at else None,
            }
        except AppException:
            raise
        except Exception:
            logger.error("获取版本差异失败", exc_info=True)
            raise AppException(status_code=500, detail="获取版本差异失败", error_code="DIFF_VERSIONS_FAILED")


async def chapter_content_db(db: AsyncSession = Depends(db_manager.get_db)):
    return ChapterContentService(db)
