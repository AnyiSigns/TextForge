
from config.logging import get_logger
from shared.pagination import PageParams, PageResult
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import WorldRepository

logger = get_logger(__name__)


class WorldService:
    def __init__(self, session: AsyncSession):
        self.repo = WorldRepository(session)

    async def list_locations_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_locations_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def list_locations(self, book_id: int) -> list[dict]:
        return await self.repo.list_locations(book_id)

    async def create_location(self, book_id: int, data: dict):
        return await self.repo.create_location(book_id, data)

    async def update_location(self, location_id: int, book_id: int, data: dict):
        return await self.repo.update_location(location_id, book_id, data)

    async def delete_location(self, location_id: int, book_id: int):
        await self.repo.delete_location(location_id, book_id)

    async def list_scene_events_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_scene_events_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def list_scene_events(self, book_id: int) -> list[dict]:
        return await self.repo.list_scene_events(book_id)

    async def create_scene_event(self, book_id: int, data: dict):
        return await self.repo.create_scene_event(book_id, data)

    async def update_scene_event(self, event_id: int, book_id: int, data: dict):
        return await self.repo.update_scene_event(event_id, book_id, data)

    async def delete_scene_event(self, event_id: int, book_id: int):
        await self.repo.delete_scene_event(event_id, book_id)

    async def list_foreshadowings_page(self, book_id: int, page_params: PageParams, status: str | None = None) -> PageResult:
        items, total = await self.repo.list_foreshadowings_page(book_id, offset=page_params.offset, limit=page_params.limit, status=status)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def list_foreshadowings(self, book_id: int, status: str | None = None) -> list[dict]:
        return await self.repo.list_foreshadowings(book_id, status=status)

    async def create_foreshadowing(self, book_id: int, data: dict):
        return await self.repo.create_foreshadowing(book_id, data)

    async def update_foreshadowing(self, item_id: int, book_id: int, data: dict):
        return await self.repo.update_foreshadowing(item_id, book_id, data)

    async def delete_foreshadowing(self, item_id: int, book_id: int):
        await self.repo.delete_foreshadowing(item_id, book_id)

    async def list_plot_threads_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_plot_threads_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def list_plot_threads(self, book_id: int) -> list[dict]:
        return await self.repo.list_plot_threads(book_id)

    async def create_plot_thread(self, book_id: int, data: dict):
        return await self.repo.create_plot_thread(book_id, data)

    async def update_plot_thread(self, item_id: int, book_id: int, data: dict):
        return await self.repo.update_plot_thread(item_id, book_id, data)

    async def delete_plot_thread(self, item_id: int, book_id: int):
        await self.repo.delete_plot_thread(item_id, book_id)
