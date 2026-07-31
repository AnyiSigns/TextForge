from typing import List, Optional
from sqlalchemy import select, update, delete as sqla_delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import Location, TimelineEvent, Foreshadowing, PlotThread


class WorldRepository:
    """世界观仓储。

    提供地点、时间线事件、伏笔、情节脉络的 CRUD。
    """

    def __init__(self, session: AsyncSession):
        """初始化 WorldRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def list_locations(self, book_id: int) -> List[Location]:
        """查询书籍地点列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            地点实例列表。
        """
        stmt = select(Location).where(Location.book_id == book_id).order_by(Location.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_location(self, book_id: int, data: dict) -> Location:
        """创建地点。

        Args:
            book_id: 书籍 ID。
            data: 地点字段字典。

        Returns:
            新创建的地点实例。
        """
        data.pop("book_id", None)
        location = Location(book_id=book_id, **data)
        self.session.add(location)
        await self.session.flush()
        await self.session.refresh(location)
        return location

    async def update_location(
        self, location_id: int, book_id: int, data: dict
    ) -> Optional[Location]:
        """更新地点。

        Args:
            location_id: 地点 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的地点实例，不存在返回 None。
        """
        stmt = select(Location).where(
            Location.id == location_id, Location.book_id == book_id
        )
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_location(self, location_id: int, book_id: int):
        """删除地点。

        Args:
            location_id: 地点 ID。
            book_id: 书籍 ID。
        """
        stmt = sqla_delete(Location).where(
            Location.id == location_id, Location.book_id == book_id
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_timeline_events(self, book_id: int) -> List[TimelineEvent]:
        """查询书籍时间线事件列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            时间线事件实例列表。
        """
        stmt = (
            select(TimelineEvent)
            .where(TimelineEvent.book_id == book_id)
            .order_by(TimelineEvent.sort_order, TimelineEvent.id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_timeline_event(self, book_id: int, data: dict) -> TimelineEvent:
        """创建时间线事件。

        Args:
            book_id: 书籍 ID。
            data: 事件字段字典。

        Returns:
            新创建的时间线事件实例。
        """
        data.pop("book_id", None)
        event = TimelineEvent(book_id=book_id, **data)
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def update_timeline_event(
        self, event_id: int, book_id: int, data: dict
    ) -> Optional[TimelineEvent]:
        """更新时间线事件。

        Args:
            event_id: 事件 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的事件实例，不存在返回 None。
        """
        stmt = select(TimelineEvent).where(
            TimelineEvent.id == event_id, TimelineEvent.book_id == book_id
        )
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_timeline_event(self, event_id: int, book_id: int):
        """删除时间线事件。

        Args:
            event_id: 事件 ID。
            book_id: 书籍 ID。
        """
        stmt = sqla_delete(TimelineEvent).where(
            TimelineEvent.id == event_id, TimelineEvent.book_id == book_id
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_foreshadowings(
        self, book_id: int, status: Optional[str] = None
    ) -> List[Foreshadowing]:
        """查询伏笔列表。

        Args:
            book_id: 书籍 ID。
            status: 伏笔状态，可选。

        Returns:
            伏笔实例列表。
        """
        stmt = select(Foreshadowing).where(Foreshadowing.book_id == book_id)
        if status:
            stmt = stmt.where(Foreshadowing.status == status)
        stmt = stmt.order_by(Foreshadowing.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_foreshadowing(self, book_id: int, data: dict) -> Foreshadowing:
        """创建伏笔。

        Args:
            book_id: 书籍 ID。
            data: 伏笔字段字典。

        Returns:
            新创建的伏笔实例。
        """
        data.pop("book_id", None)
        item = Foreshadowing(book_id=book_id, **data)
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def update_foreshadowing(
        self, item_id: int, book_id: int, data: dict
    ) -> Optional[Foreshadowing]:
        """更新伏笔。

        Args:
            item_id: 伏笔 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的伏笔实例，不存在返回 None。
        """
        stmt = select(Foreshadowing).where(
            Foreshadowing.id == item_id, Foreshadowing.book_id == book_id
        )
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_foreshadowing(self, item_id: int, book_id: int):
        """删除伏笔。

        Args:
            item_id: 伏笔 ID。
            book_id: 书籍 ID。
        """
        stmt = sqla_delete(Foreshadowing).where(
            Foreshadowing.id == item_id, Foreshadowing.book_id == book_id
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_plot_threads(self, book_id: int) -> List[PlotThread]:
        """查询情节脉络列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            情节脉络实例列表。
        """
        stmt = (
            select(PlotThread)
            .where(PlotThread.book_id == book_id)
            .order_by(PlotThread.id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_plot_thread(self, book_id: int, data: dict) -> PlotThread:
        """创建情节脉络。

        Args:
            book_id: 书籍 ID。
            data: 情节脉络字段字典。

        Returns:
            新创建的情节脉络实例。
        """
        data.pop("book_id", None)
        item = PlotThread(book_id=book_id, **data)
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def update_plot_thread(
        self, item_id: int, book_id: int, data: dict
    ) -> Optional[PlotThread]:
        """更新情节脉络。

        Args:
            item_id: 情节脉络 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的情节脉络实例，不存在返回 None。
        """
        stmt = select(PlotThread).where(
            PlotThread.id == item_id, PlotThread.book_id == book_id
        )
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_plot_thread(self, item_id: int, book_id: int):
        """删除情节脉络。

        Args:
            item_id: 情节脉络 ID。
            book_id: 书籍 ID。
        """
        stmt = sqla_delete(PlotThread).where(
            PlotThread.id == item_id, PlotThread.book_id == book_id
        )
        await self.session.execute(stmt)
        await self.session.flush()
