from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from core.auth import get_current
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from infrastructure.database import db_manager
from model.book import Book
from service.volume_service import VolumeService, volume_db
from schema.request.project import VolumeRequest
from schema.response.projiect import VolumeResponse

router = APIRouter(prefix="/volumes", tags=["Volume"])


async def _assert_book_owner(book_id: int, user_id: int, session: AsyncSession):
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")


@router.get("/books/{book_id}", response_model=dict)
async def list_volumes(
    book_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_book_owner(book_id, user_id, session)
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
    await _assert_book_owner(book_id, user_id, session)
    item = await volume_service.create_volume(book_id, title=request.title, summary=request.summary)
    if not item:
        raise HTTPException(status_code=500, detail="创建卷失败")
    return VolumeResponse.model_validate(item)


@router.put("/{volume_id}", response_model=VolumeResponse)
async def update_volume(
    volume_id: Annotated[int, Path],
    request: VolumeRequest,
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await volume_service.get_volume(0, volume_id)
    if not item:
        item = await volume_service.volume_repo.get_by_id(volume_id)
        if not item:
            raise HTTPException(status_code=404, detail="卷不存在")
    await _assert_book_owner(item.book_id, user_id, session)
    item = await volume_service.update_volume(volume_id, title=request.title, summary=request.summary)
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
    await _assert_book_owner(item.book_id, user_id, session)
    ok = await volume_service.delete_volume(volume_id)
    return {"ok": ok}
