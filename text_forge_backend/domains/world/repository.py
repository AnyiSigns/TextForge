
from sqlalchemy import delete as sqla_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import Foreshadowing, Location, PlotThread, SceneEvent


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

    async def list_locations(self, book_id: int) -> list[Location]:
        """查询书籍地点列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            地点实例列表。
        """
        stmt = select(Location).where(Location.book_id == book_id).order_by(Location.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_locations_page(self, book_id: int, offset: int = 0, limit: int = 10) -> tuple[list[Location], int]:
        stmt = select(Location).where(Location.book_id == book_id).order_by(Location.id)
        count_stmt = select(func.count()).select_from(Location).where(Location.book_id == book_id)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

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
        await self.session.commit()
        return location

    async def update_location(self, location_id: int, book_id: int, data: dict) -> Location | None:
        """更新地点。

        Args:
            location_id: 地点 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的地点实例，不存在返回 None。
        """
        stmt = select(Location).where(Location.id == location_id, Location.book_id == book_id)
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
        stmt = sqla_delete(Location).where(Location.id == location_id, Location.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def list_scene_events(self, book_id: int) -> list[SceneEvent]:
        """查询书籍时间线事件列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            时间线事件实例列表。
        """
        stmt = select(SceneEvent).where(SceneEvent.book_id == book_id).order_by(SceneEvent.sort_order, SceneEvent.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_scene_events_page(self, book_id: int, offset: int = 0, limit: int = 10) -> tuple[list[SceneEvent], int]:
        stmt = select(SceneEvent).where(SceneEvent.book_id == book_id).order_by(SceneEvent.sort_order, SceneEvent.id)
        count_stmt = select(func.count()).select_from(SceneEvent).where(SceneEvent.book_id == book_id)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def create_scene_event(self, book_id: int, data: dict) -> SceneEvent:
        """创建时间线事件。

        Args:
            book_id: 书籍 ID。
            data: 事件字段字典。

        Returns:
            新创建的时间线事件实例。
        """
        data.pop("book_id", None)
        event = SceneEvent(book_id=book_id, **data)
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        await self.session.commit()
        return event

    async def update_scene_event(self, event_id: int, book_id: int, data: dict) -> SceneEvent | None:
        """更新时间线事件。

        Args:
            event_id: 事件 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的事件实例，不存在返回 None。
        """
        stmt = select(SceneEvent).where(SceneEvent.id == event_id, SceneEvent.book_id == book_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_scene_event(self, event_id: int, book_id: int):
        """删除时间线事件。

        Args:
            event_id: 事件 ID。
            book_id: 书籍 ID。
        """
        stmt = sqla_delete(SceneEvent).where(SceneEvent.id == event_id, SceneEvent.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def list_foreshadowings(self, book_id: int, status: str | None = None) -> list[Foreshadowing]:
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

    async def list_foreshadowings_page(self, book_id: int, offset: int = 0, limit: int = 10, status: str | None = None) -> tuple[list[Foreshadowing], int]:
        stmt = select(Foreshadowing).where(Foreshadowing.book_id == book_id)
        count_stmt = select(func.count()).select_from(Foreshadowing).where(Foreshadowing.book_id == book_id)
        if status:
            stmt = stmt.where(Foreshadowing.status == status)
            count_stmt = count_stmt.where(Foreshadowing.status == status)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.order_by(Foreshadowing.id).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

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
        await self.session.commit()
        return item

    async def update_foreshadowing(self, item_id: int, book_id: int, data: dict) -> Foreshadowing | None:
        """更新伏笔。

        Args:
            item_id: 伏笔 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的伏笔实例，不存在返回 None。
        """
        stmt = select(Foreshadowing).where(Foreshadowing.id == item_id, Foreshadowing.book_id == book_id)
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
        stmt = sqla_delete(Foreshadowing).where(Foreshadowing.id == item_id, Foreshadowing.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def list_plot_threads(self, book_id: int) -> list[PlotThread]:
        """查询情节脉络列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            情节脉络实例列表。
        """
        stmt = select(PlotThread).where(PlotThread.book_id == book_id).order_by(PlotThread.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_plot_threads_page(self, book_id: int, offset: int = 0, limit: int = 10) -> tuple[list[PlotThread], int]:
        stmt = select(PlotThread).where(PlotThread.book_id == book_id).order_by(PlotThread.id)
        count_stmt = select(func.count()).select_from(PlotThread).where(PlotThread.book_id == book_id)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

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
        await self.session.commit()
        return item

    async def update_plot_thread(self, item_id: int, book_id: int, data: dict) -> PlotThread | None:
        """更新情节脉络。

        Args:
            item_id: 情节脉络 ID。
            book_id: 书籍 ID。
            data: 更新字段字典。

        Returns:
            更新后的情节脉络实例，不存在返回 None。
        """
        stmt = select(PlotThread).where(PlotThread.id == item_id, PlotThread.book_id == book_id)
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
        stmt = sqla_delete(PlotThread).where(PlotThread.id == item_id, PlotThread.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.commit()
