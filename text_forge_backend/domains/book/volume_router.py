from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from schema.request.book import VolumeRequest, VolumeUpdate
from schema.response.book import VolumeResponse
from shared.database import db_manager

from ._owner_check import assert_book_owner
from .volume_service import VolumeService, volume_db

router = APIRouter(prefix="/volumes", tags=["Volume"])


@router.get("/books/{book_id}", response_model=dict)
async def list_volumes(
    book_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await assert_book_owner(book_id, user_id, session)
    items = await volume_service.list_volumes(book_id)
    return {"volumes": [VolumeResponse.model_validate(v) for v in items]}


@router.post("/books/{book_id}", response_model=VolumeResponse)
async def create_volume(
    book_id: Annotated[int, Path],
    request: VolumeRequest,
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await assert_book_owner(book_id, user_id, session)
    create_kwargs: dict = {"title": request.title, "summary": request.summary}
    if request.sort_order is not None:
        create_kwargs["sort_order"] = request.sort_order
    item = await volume_service.create_volume(book_id, **create_kwargs)
    if not item:
        raise HTTPException(status_code=500, detail="创建卷失败")
    return VolumeResponse.model_validate(item)


@router.put("/{volume_id}", response_model=VolumeResponse)
async def update_volume(
    volume_id: Annotated[int, Path],
    request: VolumeUpdate,
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await volume_service.volume_repo.get_by_id(volume_id)
    if not item:
        raise HTTPException(status_code=404, detail="卷不存在")
    await assert_book_owner(item.book_id, user_id, session)
    data = request.model_dump(by_alias=False, exclude_unset=True)
    item = await volume_service.update_volume(volume_id, **data)
    if not item:
        raise HTTPException(status_code=404, detail="卷不存在")
    return VolumeResponse.model_validate(item)


@router.delete("/{volume_id}")
async def delete_volume(
    volume_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await volume_service.volume_repo.get_by_id(volume_id)
    if not item:
        raise HTTPException(status_code=404, detail="卷不存在")
    await assert_book_owner(item.book_id, user_id, session)
    ok = await volume_service.delete_volume(volume_id)
    return {"ok": ok}
