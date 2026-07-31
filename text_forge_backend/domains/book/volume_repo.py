from sqlalchemy import select
from domains.shared.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from models.book import Volume


class VolumeRepository(BaseRepository[Volume]):
    """卷仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 VolumeRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(Volume, session)

    async def list_volumes(self, book_id: int):
        """查询书籍卷列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            卷实例列表。
        """
        stmt = (
            select(Volume)
            .where(Volume.book_id == book_id)
            .order_by(Volume.sort_order, Volume.id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_volume(self, book_id: int, volume_id: int):
        """查询单个卷。

        Args:
            book_id: 书籍 ID。
            volume_id: 卷 ID。

        Returns:
            卷实例，不存在返回 None。
        """
        stmt = select(Volume).where(Volume.book_id == book_id, Volume.id == volume_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, volume_id: int):
        """根据主键查询卷。

        Args:
            volume_id: 卷 ID。

        Returns:
            卷实例，不存在返回 None。
        """
        return await self.get(volume_id)

    async def create_volume(self, book_id: int, **kwargs):
        """创建卷。

        Args:
            book_id: 书籍 ID。
            **kwargs: 卷字段。

        Returns:
            新创建的卷实例。
        """
        instance = await self.add(book_id=book_id, **kwargs)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def update_volume(self, volume_id: int, **kwargs):
        """更新卷。

        Args:
            volume_id: 卷 ID。
            **kwargs: 要更新的字段。

        Returns:
            更新后的卷实例，不存在返回 None。
        """
        instance = await self.get(volume_id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_volume(self, volume_id: int):
        """删除卷。

        Args:
            volume_id: 卷 ID。

        Returns:
            BaseRepository.delete 的返回值。
        """
        return await self.delete(volume_id)
