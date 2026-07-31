from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shared.database import db_manager
from models.book import Book
from schema.response.outline import OutlineResponse, ListOutlinesResponse
from schema.request.outline import OutlineRequest
from domains.book.outline_service import OutlineService, outline_db

router = APIRouter(prefix="/outlines", tags=["Outline"])


async def _assert_book_owner(book_id: int, user_id: int, session: AsyncSession):
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")


@router.get("/books/{book_id}", response_model=ListOutlinesResponse)
async def list_outlines(
    book_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
):
    items = await outline_service.list_outlines(book_id)
    return ListOutlinesResponse(outlines=items)


@router.get("/books/{book_id}/{outline_id}", response_model=OutlineResponse)
async def get_outline(
    book_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
):
    item = await outline_service.get_outline(book_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    return item


@router.post("/books/{book_id}", response_model=OutlineResponse)
async def create_outline(
    book_id: Annotated[int, Path],
    body: OutlineRequest,
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_book_owner(book_id, user_id, session)
    data = {
        k: v
        for k, v in body.model_dump(by_alias=False, exclude_none=True).items()
        if k != "book_id"
    }
    item = await outline_service.create_outline(book_id, **data)
    if not item:
        raise HTTPException(status_code=500, detail="创建大纲失败")
    return item


@router.put("/books/{book_id}/{outline_id}", response_model=OutlineResponse)
async def update_outline(
    book_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    body: OutlineRequest,
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await outline_service.get_outline(book_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    await _assert_book_owner(book_id, user_id, session)
    data = {
        k: v
        for k, v in body.model_dump(by_alias=False, exclude_none=True).items()
        if k not in ("book_id", "chapter_id", "summary")
    }
    chapter_id = body.chapter_id
    summary = body.summary
    item = await outline_service.update_outline(
        outline_id, chapter_id=chapter_id, summary=summary, **data
    )
    if item:
        raw_data = data.get("data")
        if raw_data:
            await outline_service.auto_summarize_if_needed(
                outline_id, book_id, user_id, raw_data
            )
    return item


@router.delete("/books/{book_id}/{outline_id}")
async def delete_outline(
    book_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await outline_service.get_outline(book_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    await _assert_book_owner(book_id, user_id, session)
    ok = await outline_service.delete_outline(outline_id)
    return {"ok": ok}
