from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from models.book import Book, Volume
from schema.request.book import ChapterRequest, ChapterUpdate
from schema.response.book import ChapterResponse
from shared.database import db_manager

from .chapter_service import ChapterService, chapter_db

router = APIRouter(prefix="/chapters", tags=["Chapter"])


async def _assert_volume_owner(volume_id: int, user_id: int, session: AsyncSession):
    stmt = (
        select(Volume).join(Book).where(Volume.id == volume_id, Book.user_id == user_id)
    )
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="卷不存在或无权访问")


@router.get("/volumes/{volume_id}", response_model=dict)
async def list_chapters(
    volume_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_volume_owner(volume_id, user_id, session)
    items = await chapter_service.list_chapters(volume_id)
    return {"chapters": [ChapterResponse.model_validate(c) for c in items]}


@router.post("/volumes/{volume_id}", response_model=ChapterResponse)
async def create_chapter(
    volume_id: Annotated[int, Path],
    request: ChapterRequest,
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_volume_owner(volume_id, user_id, session)
    create_kwargs: dict = {
        "title": request.title,
        "summary": request.summary,
        "locked": request.locked,
    }
    if request.sort_order is not None:
        create_kwargs["sort_order"] = request.sort_order
    item = await chapter_service.create_chapter(volume_id, **create_kwargs)
    if not item:
        raise HTTPException(status_code=500, detail="创建章节失败")
    return ChapterResponse.model_validate(item)


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    chapter_id: Annotated[int, Path],
    request: ChapterUpdate,
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await chapter_service.chapter_repo.get_by_id(chapter_id)
    if not item:
        raise HTTPException(status_code=404, detail="章节不存在")
    await _assert_volume_owner(item.volume_id, user_id, session)
    data = request.model_dump(by_alias=False, exclude_unset=True)
    item = await chapter_service.update_chapter(chapter_id, **data)
    if not item:
        raise HTTPException(status_code=404, detail="章节不存在")
    return ChapterResponse.model_validate(item)


@router.delete("/{chapter_id}")
async def delete_chapter(
    chapter_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await chapter_service.chapter_repo.get_by_id(chapter_id)
    if not item:
        raise HTTPException(status_code=404, detail="章节不存在")
    await _assert_volume_owner(item.volume_id, user_id, session)
    ok = await chapter_service.delete_chapter(chapter_id)
    return {"ok": ok}
