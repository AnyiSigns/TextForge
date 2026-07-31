from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from repository.world_repo import WorldRepository
from config.logging import get_logger

logger = get_logger(__name__)


class WorldService:
    def __init__(self, session: AsyncSession):
        self.repo = WorldRepository(session)

    async def list_locations(self, book_id: int) -> List[dict]:
        return await self.repo.list_locations(book_id)

    async def create_location(self, book_id: int, data: dict):
        return await self.repo.create_location(book_id, data)

    async def update_location(self, location_id: int, book_id: int, data: dict):
        return await self.repo.update_location(location_id, book_id, data)

    async def delete_location(self, location_id: int, book_id: int):
        await self.repo.delete_location(location_id, book_id)

    async def list_timeline_events(self, book_id: int) -> List[dict]:
        return await self.repo.list_timeline_events(book_id)

    async def create_timeline_event(self, book_id: int, data: dict):
        return await self.repo.create_timeline_event(book_id, data)

    async def update_timeline_event(self, event_id: int, book_id: int, data: dict):
        return await self.repo.update_timeline_event(event_id, book_id, data)

    async def delete_timeline_event(self, event_id: int, book_id: int):
        await self.repo.delete_timeline_event(event_id, book_id)

    async def list_foreshadowings(
        self, book_id: int, status: Optional[str] = None
    ) -> List[dict]:
        return await self.repo.list_foreshadowings(book_id, status=status)

    async def create_foreshadowing(self, book_id: int, data: dict):
        return await self.repo.create_foreshadowing(book_id, data)

    async def update_foreshadowing(self, item_id: int, book_id: int, data: dict):
        return await self.repo.update_foreshadowing(item_id, book_id, data)

    async def delete_foreshadowing(self, item_id: int, book_id: int):
        await self.repo.delete_foreshadowing(item_id, book_id)

    async def list_plot_threads(self, book_id: int) -> List[dict]:
        return await self.repo.list_plot_threads(book_id)

    async def create_plot_thread(self, book_id: int, data: dict):
        return await self.repo.create_plot_thread(book_id, data)

    async def update_plot_thread(self, item_id: int, book_id: int, data: dict):
        return await self.repo.update_plot_thread(item_id, book_id, data)

    async def delete_plot_thread(self, item_id: int, book_id: int):
        await self.repo.delete_plot_thread(item_id, book_id)
