from typing import List, Optional
from sqlalchemy import select, update, delete as sqla_delete
from sqlalchemy.ext.asyncio import AsyncSession

from model.book import Location, TimelineEvent, Foreshadowing, PlotThread


class WorldRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_locations(self, book_id: int) -> List[Location]:
        stmt = select(Location).where(Location.book_id == book_id).order_by(Location.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_location(self, book_id: int, data: dict) -> Location:
        location = Location(book_id=book_id, **data)
        self.session.add(location)
        await self.session.flush()
        return location

    async def update_location(self, location_id: int, book_id: int, data: dict) -> Optional[Location]:
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
        stmt = sqla_delete(Location).where(Location.id == location_id, Location.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_timeline_events(self, book_id: int) -> List[TimelineEvent]:
        stmt = select(TimelineEvent).where(TimelineEvent.book_id == book_id).order_by(TimelineEvent.sort_order, TimelineEvent.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_timeline_event(self, book_id: int, data: dict) -> TimelineEvent:
        event = TimelineEvent(book_id=book_id, **data)
        self.session.add(event)
        await self.session.flush()
        return event

    async def update_timeline_event(self, event_id: int, book_id: int, data: dict) -> Optional[TimelineEvent]:
        stmt = select(TimelineEvent).where(TimelineEvent.id == event_id, TimelineEvent.book_id == book_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete_timeline_event(self, event_id: int, book_id: int):
        stmt = sqla_delete(TimelineEvent).where(TimelineEvent.id == event_id, TimelineEvent.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_foreshadowings(self, book_id: int, status: Optional[str] = None) -> List[Foreshadowing]:
        stmt = select(Foreshadowing).where(Foreshadowing.book_id == book_id)
        if status:
            stmt = stmt.where(Foreshadowing.status == status)
        stmt = stmt.order_by(Foreshadowing.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_foreshadowing(self, book_id: int, data: dict) -> Foreshadowing:
        item = Foreshadowing(book_id=book_id, **data)
        self.session.add(item)
        await self.session.flush()
        return item

    async def update_foreshadowing(self, item_id: int, book_id: int, data: dict) -> Optional[Foreshadowing]:
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
        stmt = sqla_delete(Foreshadowing).where(Foreshadowing.id == item_id, Foreshadowing.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.flush()

    async def list_plot_threads(self, book_id: int) -> List[PlotThread]:
        stmt = select(PlotThread).where(PlotThread.book_id == book_id).order_by(PlotThread.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_plot_thread(self, book_id: int, data: dict) -> PlotThread:
        item = PlotThread(book_id=book_id, **data)
        self.session.add(item)
        await self.session.flush()
        return item

    async def update_plot_thread(self, item_id: int, book_id: int, data: dict) -> Optional[PlotThread]:
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
        stmt = sqla_delete(PlotThread).where(PlotThread.id == item_id, PlotThread.book_id == book_id)
        await self.session.execute(stmt)
        await self.session.flush()
