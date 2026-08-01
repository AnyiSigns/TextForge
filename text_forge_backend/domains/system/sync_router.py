from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from shared.database import db_manager

from .sync_service import SyncService, model_to_dict

router = APIRouter(tags=["Sync"])


async def get_sync_service(
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
    user_id: Annotated[int, Depends(get_current)],
) -> SyncService:
    return SyncService(session, user_id)


@router.get("/sync")
async def sync_data(
    since: str = Query(default="", description="时间戳，仅返回此时间之后的更新"),
    store: str = Query(default="default", description="存储类型"),
    service: SyncService = Depends(get_sync_service),
) -> dict[str, Any]:
    if since:
        since_dt = datetime.fromisoformat(since)
        if since_dt.tzinfo is not None:
            since_dt = since_dt.replace(tzinfo=None)
    else:
        since_dt = datetime.min

    records: list[Any] = []
    if store == "books":
        records = await service.sync_books(since_dt)
    elif store == "characters":
        records = await service.sync_characters(since_dt)
    elif store == "creative-settings":
        records = await service.sync_creative_settings(since_dt)
    elif store == "world":
        records = []
        for r in await service.sync_world_locations(since_dt):
            d = model_to_dict(r)
            d["_type"] = "location"
            records.append(d)
        for r in await service.sync_world_timeline_events(since_dt):
            d = model_to_dict(r)
            d["_type"] = "timeline_event"
            records.append(d)
        for r in await service.sync_world_foreshadowings(since_dt):
            d = model_to_dict(r)
            d["_type"] = "foreshadowing"
            records.append(d)
        for r in await service.sync_world_plot_threads(since_dt):
            d = model_to_dict(r)
            d["_type"] = "plot_thread"
            records.append(d)
    elif store == "manuscript":
        records = [
            *await service.sync_chapters(since_dt),
            *await service.sync_chapter_contents(since_dt),
        ]
    elif store == "writing-sessions":
        records = await service.sync_writing_sessions(since_dt)
    else:
        return {"updates": [], "version": datetime.now().isoformat(), "error": f"未知的 store: {store}"}

    updates = [model_to_dict(r) for r in records]
    version = datetime.now().isoformat()
    return {"updates": updates, "version": version}
