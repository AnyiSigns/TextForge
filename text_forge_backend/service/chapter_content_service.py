from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.chapter_content_repo import ChapterContentRepository
from utils.logger import get_logger

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
            return []

    async def get_latest_content(self, chapter_id: int):
        try:
            return await self.content_repo.get_latest_content(chapter_id)
        except Exception:
            logger.error("获取最新正文失败", exc_info=True)
            return None

    async def create_content(self, chapter_id: int, content: str):
        try:
            return await self.content_repo.create_content(chapter_id, content)
        except Exception:
            logger.error("创建正文失败", exc_info=True)
            return None


async def chapter_content_db(db: AsyncSession = Depends(db_manager.get_db)):
    return ChapterContentService(db)
