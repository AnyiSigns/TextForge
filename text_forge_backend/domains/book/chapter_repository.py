from sqlalchemy import select
from shared.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from models.book import Chapter


class ChapterRepository(BaseRepository[Chapter]):
    """章节仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 ChapterRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(Chapter, session)

    async def list_chapters(self, volume_id: int):
        """查询卷下章节列表。

        Args:
            volume_id: 卷 ID。

        Returns:
            章节实例列表。
        """
        stmt = select(Chapter).where(Chapter.volume_id == volume_id).order_by(Chapter.sort_order, Chapter.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_chapter(self, volume_id: int, chapter_id: int):
        """查询单个章节。

        Args:
            volume_id: 卷 ID。
            chapter_id: 章节 ID。

        Returns:
            章节实例，不存在返回 None。
        """
        stmt = select(Chapter).where(Chapter.volume_id == volume_id, Chapter.id == chapter_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, chapter_id: int):
        """根据主键查询章节。

        Args:
            chapter_id: 章节 ID。

        Returns:
            章节实例，不存在返回 None。
        """
        return await self.get(chapter_id)

    async def create_chapter(self, volume_id: int, **kwargs):
        """创建章节。

        Args:
            volume_id: 卷 ID。
            **kwargs: 章节字段。

        Returns:
            新创建的章节实例。
        """
        instance = await self.add(volume_id=volume_id, **kwargs)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def update_chapter(self, chapter_id: int, **kwargs):
        """更新章节。

        Args:
            chapter_id: 章节 ID。
            **kwargs: 要更新的字段。

        Returns:
            更新后的章节实例，不存在返回 None。
        """
        instance = await self.get(chapter_id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_chapter(self, chapter_id: int):
        """删除章节。

        Args:
            chapter_id: 章节 ID。

        Returns:
            BaseRepository.delete 的返回值。
        """
        return await self.delete(chapter_id)
