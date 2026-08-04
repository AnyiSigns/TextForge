
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Query
from schema.request.world import (
    ForeshadowingRequest,
    LocationRequest,
    PlotThreadRequest,
    SceneEventRequest,
)
from schema.response.world import (
    ForeshadowingResponse,
    LocationResponse,
    PlotThreadResponse,
    SceneEventResponse,
)
from shared.database import db_manager
from shared.pagination import PageParams, PageResult
from sqlalchemy.ext.asyncio import AsyncSession

from .service import WorldService

router = APIRouter(prefix="/world", tags=["World"])


def world_db(session: AsyncSession = Depends(db_manager.get_db)) -> WorldService:
    return WorldService(session)


@router.get("/locations", response_model=PageResult[LocationResponse])
async def list_locations(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    page_params: PageParams = Depends(),
    service: WorldService = Depends(world_db),
):
    return await service.list_locations_page(book_id, page_params)


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


@router.get("/timeline-events", response_model=PageResult[SceneEventResponse])
async def list_scene_events(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    page_params: PageParams = Depends(),
    service: WorldService = Depends(world_db),
):
    return await service.list_scene_events_page(book_id, page_params)


@router.post("/timeline-events", response_model=SceneEventResponse)
async def create_scene_event(
    user_id=Depends(get_current),
    request: SceneEventRequest = ...,
    service: WorldService = Depends(world_db),
):
    return await service.create_scene_event(request.book_id, request.model_dump(by_alias=False))


@router.put("/timeline-events/{event_id}", response_model=SceneEventResponse)
async def update_scene_event(
    user_id=Depends(get_current),
    event_id: int = ...,
    request: SceneEventRequest = ...,
    service: WorldService = Depends(world_db),
):
    instance = await service.update_scene_event(event_id, request.book_id, request.model_dump(by_alias=False))
    if not instance:
        raise HTTPException(status_code=404, detail="事件不存在")
    return instance


@router.delete("/timeline-events/{event_id}")
async def delete_scene_event(
    user_id=Depends(get_current),
    event_id: int = ...,
    book_id: int = Query(...),
    service: WorldService = Depends(world_db),
):
    await service.delete_scene_event(event_id, book_id)
    return {"ok": True}


@router.get("/foreshadowings", response_model=PageResult[ForeshadowingResponse])
async def list_foreshadowings(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    status: str | None = None,
    page_params: PageParams = Depends(),
    service: WorldService = Depends(world_db),
):
    return await service.list_foreshadowings_page(book_id, page_params, status=status)


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


@router.get("/plot-threads", response_model=PageResult[PlotThreadResponse])
async def list_plot_threads(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    page_params: PageParams = Depends(),
    service: WorldService = Depends(world_db),
):
    return await service.list_plot_threads_page(book_id, page_params)


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
