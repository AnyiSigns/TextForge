from typing import List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from shared.database import db_manager
from schema.request.world import (
    LocationRequest,
    TimelineEventRequest,
    ForeshadowingRequest,
    PlotThreadRequest,
)
from schema.response.world import (
    LocationResponse,
    TimelineEventResponse,
    ForeshadowingResponse,
    PlotThreadResponse,
)
from .service import WorldService

router = APIRouter(prefix="/world", tags=["World"])


def world_db(session: AsyncSession = Depends(db_manager.get_db)) -> WorldService:
    return WorldService(session)


@router.get("/locations", response_model=List[LocationResponse])
async def list_locations(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    return await service.list_locations(book_id)


@router.post("/locations", response_model=LocationResponse)
async def create_location(
    user_id=Depends(get_current),
    request: LocationRequest = ...,
    service: WorldService = Depends(world_db),
):
    return await service.create_location(request.book_id, request.model_dump(by_alias=False))


@router.put("/locations/{location_id}", response_model=LocationResponse)
async def update_location(
    user_id=Depends(get_current),
    location_id: int = ...,
    request: LocationRequest = ...,
    service: WorldService = Depends(world_db),
):
    instance = await service.update_location(location_id, request.book_id, request.model_dump(by_alias=False))
    if not instance:
        raise HTTPException(status_code=404, detail="地点不存在")
    return instance


@router.delete("/locations/{location_id}")
async def delete_location(
    user_id=Depends(get_current),
    location_id: int = ...,
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    await service.delete_location(location_id, book_id)
    return {"ok": True}


@router.get("/timeline-events", response_model=List[TimelineEventResponse])
async def list_timeline_events(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    return await service.list_timeline_events(book_id)


@router.post("/timeline-events", response_model=TimelineEventResponse)
async def create_timeline_event(
    user_id=Depends(get_current),
    request: TimelineEventRequest = ...,
    service: WorldService = Depends(world_db),
):
    return await service.create_timeline_event(request.book_id, request.model_dump(by_alias=False))


@router.put("/timeline-events/{event_id}", response_model=TimelineEventResponse)
async def update_timeline_event(
    user_id=Depends(get_current),
    event_id: int = ...,
    request: TimelineEventRequest = ...,
    service: WorldService = Depends(world_db),
):
    instance = await service.update_timeline_event(event_id, request.book_id, request.model_dump(by_alias=False))
    if not instance:
        raise HTTPException(status_code=404, detail="事件不存在")
    return instance


@router.delete("/timeline-events/{event_id}")
async def delete_timeline_event(
    user_id=Depends(get_current),
    event_id: int = ...,
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    await service.delete_timeline_event(event_id, book_id)
    return {"ok": True}


@router.get("/foreshadowings", response_model=List[ForeshadowingResponse])
async def list_foreshadowings(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    status: str | None = None,
    service: WorldService = Depends(world_db),
):
    return await service.list_foreshadowings(book_id, status=status)


@router.post("/foreshadowings", response_model=ForeshadowingResponse)
async def create_foreshadowing(
    user_id=Depends(get_current),
    request: ForeshadowingRequest = ...,
    service: WorldService = Depends(world_db),
):
    return await service.create_foreshadowing(request.book_id, request.model_dump(by_alias=False))


@router.put("/foreshadowings/{item_id}", response_model=ForeshadowingResponse)
async def update_foreshadowing(
    user_id=Depends(get_current),
    item_id: int = ...,
    request: ForeshadowingRequest = ...,
    service: WorldService = Depends(world_db),
):
    instance = await service.update_foreshadowing(item_id, request.book_id, request.model_dump(by_alias=False))
    if not instance:
        raise HTTPException(status_code=404, detail="伏笔不存在")
    return instance


@router.delete("/foreshadowings/{item_id}")
async def delete_foreshadowing(
    user_id=Depends(get_current),
    item_id: int = ...,
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    await service.delete_foreshadowing(item_id, book_id)
    return {"ok": True}


@router.get("/plot-threads", response_model=List[PlotThreadResponse])
async def list_plot_threads(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    return await service.list_plot_threads(book_id)


@router.post("/plot-threads", response_model=PlotThreadResponse)
async def create_plot_thread(
    user_id=Depends(get_current),
    request: PlotThreadRequest = ...,
    service: WorldService = Depends(world_db),
):
    return await service.create_plot_thread(request.book_id, request.model_dump(by_alias=False))


@router.put("/plot-threads/{item_id}", response_model=PlotThreadResponse)
async def update_plot_thread(
    user_id=Depends(get_current),
    item_id: int = ...,
    request: PlotThreadRequest = ...,
    service: WorldService = Depends(world_db),
):
    instance = await service.update_plot_thread(item_id, request.book_id, request.model_dump(by_alias=False))
    if not instance:
        raise HTTPException(status_code=404, detail="情节脉络不存在")
    return instance


@router.delete("/plot-threads/{item_id}")
async def delete_plot_thread(
    user_id=Depends(get_current),
    item_id: int = ...,
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    await service.delete_plot_thread(item_id, book_id)
    return {"ok": True}
