from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from infrastructure.database import db_manager
from model.book import Book, Chapter
from service.chapter_content_service import ChapterContentService, chapter_content_db
from text_forge_backend.schema.request.book import ChapterContentRequest
from text_forge_backend.schema.response.book import ChapterContentResponse

router = APIRouter(prefix="/chapter-contents", tags=["ChapterContent"])


async def _assert_chapter_owner(chapter_id: int, user_id: int, session: AsyncSession):
    stmt = (
        select(Chapter)
        .join(Book)
        .where(Chapter.id == chapter_id, Book.user_id == user_id)
    )
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="章节不存在或无权访问")


@router.get("/chapters/{chapter_id}", response_model=dict)
async def list_contents(
    chapter_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    content_service: Annotated[ChapterContentService, Depends(chapter_content_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_chapter_owner(chapter_id, user_id, session)
    items = await content_service.list_contents(chapter_id)
    return {"contents": [ChapterContentResponse.model_validate(c) for c in items]}


@router.get("/chapters/{chapter_id}/latest", response_model=ChapterContentResponse)
async def get_latest_content(
    chapter_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    content_service: Annotated[ChapterContentService, Depends(chapter_content_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_chapter_owner(chapter_id, user_id, session)
    item = await content_service.get_latest_content(chapter_id)
    if not item:
        raise HTTPException(status_code=404, detail="正文不存在")
    return ChapterContentResponse.model_validate(item)


@router.post("/chapters/{chapter_id}", response_model=ChapterContentResponse)
async def create_content(
    chapter_id: Annotated[int, Path],
    request: ChapterContentRequest,
    user_id: Annotated[int, Depends(get_current)],
    content_service: Annotated[ChapterContentService, Depends(chapter_content_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_chapter_owner(chapter_id, user_id, session)
    item = await content_service.create_content(chapter_id, request.content)
    if not item:
        raise HTTPException(status_code=500, detail="创建正文失败")
    return ChapterContentResponse.model_validate(item)
