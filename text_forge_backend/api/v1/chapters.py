from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from infrastructure.database import db_manager
from model.book import Book, Volume
from service.chapter_service import ChapterService, chapter_db
from schema.request.book import ChapterRequest
from schema.response.book import ChapterResponse

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
    item = await chapter_service.create_chapter(
        volume_id, title=request.title, summary=request.summary
    )
    if not item:
        raise HTTPException(status_code=500, detail="创建章节失败")
    return ChapterResponse.model_validate(item)


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    chapter_id: Annotated[int, Path],
    request: ChapterRequest,
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await chapter_service.get_chapter(0, chapter_id)
    if not item:
        item = await chapter_service.chapter_repo.get_by_id(chapter_id)
        if not item:
            raise HTTPException(status_code=404, detail="章节不存在")
    await _assert_volume_owner(item.volume_id, user_id, session)
    item = await chapter_service.update_chapter(
        chapter_id, title=request.title, summary=request.summary
    )
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
