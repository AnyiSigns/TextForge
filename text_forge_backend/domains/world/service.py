
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from shared.pagination import PageParams, PageResult

from .constants import normalize_foreshadowing_status, normalize_plot_thread_status
from .derived_sync import schedule_recompute
from .repository import WorldRepository

logger = get_logger(__name__)


def _normalize_status(data: dict, normalizer) -> dict:
    """写入前把 status 中文别名归一化为英文枚举（REST 与 agent 工具口径一致）。

    Args:
        data: 待写入字段字典。
        normalizer: 对应实体的状态归一化函数。

    Returns:
        原字典（就地归一化 status 后返回）。
    """
    if data.get("status"):
        data["status"] = normalizer(data["status"])
    return data


class WorldService:
    def __init__(self, session: AsyncSession):
        self.repo = WorldRepository(session)

    async def _refresh_item(self, item):
        """派生重算由后台防抖执行，此处仅刷新返回实例保证序列化可用。

        Args:
            item: 需要返回的实体实例。

        Returns:
            刷新后的实例。
        """
        if item is not None:
            await self.repo.session.refresh(item)
        return item

    async def list_locations_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_locations_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def create_location(self, book_id: int, data: dict):
        return await self.repo.create_location(book_id, data)

    async def update_location(self, location_id: int, book_id: int, data: dict):
        return await self.repo.update_location(location_id, book_id, data)

    async def delete_location(self, location_id: int, book_id: int):
        await self.repo.delete_location(location_id, book_id)

    async def list_scene_events_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_scene_events_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def create_scene_event(self, book_id: int, data: dict):
        item = await self.repo.create_scene_event(book_id, data)
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def update_scene_event(self, event_id: int, book_id: int, data: dict):
        item = await self.repo.update_scene_event(event_id, book_id, data)
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def delete_scene_event(self, event_id: int, book_id: int):
        await self.repo.delete_scene_event(event_id, book_id)
        schedule_recompute(book_id)

    async def list_foreshadowings_page(self, book_id: int, page_params: PageParams, status: str | None = None) -> PageResult:
        items, total = await self.repo.list_foreshadowings_page(book_id, offset=page_params.offset, limit=page_params.limit, status=status)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def create_foreshadowing(self, book_id: int, data: dict):
        item = await self.repo.create_foreshadowing(
            book_id, _normalize_status(data, normalize_foreshadowing_status)
        )
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def update_foreshadowing(self, item_id: int, book_id: int, data: dict):
        item = await self.repo.update_foreshadowing(
            item_id, book_id, _normalize_status(data, normalize_foreshadowing_status)
        )
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def delete_foreshadowing(self, item_id: int, book_id: int):
        await self.repo.delete_foreshadowing(item_id, book_id)
        schedule_recompute(book_id)

    async def list_plot_threads_page(self, book_id: int, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_plot_threads_page(book_id, offset=page_params.offset, limit=page_params.limit)
        return PageResult(items=items, total=total, page=page_params.page, page_size=page_params.page_size)

    async def create_plot_thread(self, book_id: int, data: dict):
        item = await self.repo.create_plot_thread(
            book_id, _normalize_status(data, normalize_plot_thread_status)
        )
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def update_plot_thread(self, item_id: int, book_id: int, data: dict):
        item = await self.repo.update_plot_thread(
            item_id, book_id, _normalize_status(data, normalize_plot_thread_status)
        )
        schedule_recompute(book_id)
        return await self._refresh_item(item)

    async def delete_plot_thread(self, item_id: int, book_id: int):
        await self.repo.delete_plot_thread(item_id, book_id)
        schedule_recompute(book_id)
