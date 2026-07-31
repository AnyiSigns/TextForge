from sqlalchemy import select, func
from shared.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from models.book import ChapterContent


class ChapterContentRepository(BaseRepository[ChapterContent]):
    """章节内容仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 ChapterContentRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(ChapterContent, session)

    async def list_contents(self, chapter_id: int):
        """查询章节所有内容版本。

        Args:
            chapter_id: 章节 ID。

        Returns:
            章节内容实例列表。
        """
        stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.version)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_latest_content(self, chapter_id: int):
        """查询章节最新内容。

        Args:
            chapter_id: 章节 ID。

        Returns:
            最新章节内容实例，不存在返回 None。
        """
        stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id)
            .order_by(ChapterContent.version.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_content_by_version(self, chapter_id: int, version: int):
        """按版本查询章节内容。

        Args:
            chapter_id: 章节 ID。
            version: 版本号。

        Returns:
            章节内容实例，不存在返回 None。
        """
        stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == version)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_content(self, chapter_id: int, content: str):
        """创建新版本章节内容。

        Args:
            chapter_id: 章节 ID。
            content: 正文内容。

        Returns:
            新创建的章节内容实例。
        """
        next_version = await self._next_version(chapter_id)
        instance = await self.add(chapter_id=chapter_id, content=content, version=next_version)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def _next_version(self, chapter_id: int) -> int:
        """计算下一个版本号。

        Args:
            chapter_id: 章节 ID。

        Returns:
            下一个版本号。
        """
        stmt = select(func.coalesce(func.max(ChapterContent.version), 0)).where(ChapterContent.chapter_id == chapter_id)
        result = await self.session.execute(stmt)
        current = result.scalar_one() or 0
        return current + 1
