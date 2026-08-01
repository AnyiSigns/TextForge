from typing import Annotated

from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Path
from models.book import Book
from schema.request.book import CreativeSettingRequest
from schema.response.book import CreativeSettingResponse
from shared.database import db_manager
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .service import BookService, book_db

router = APIRouter(prefix="/creative-settings", tags=["CreativeSetting"])


@router.get("/books/{book_id}", response_model=CreativeSettingResponse)
async def get_creative_setting(
    book_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    from .repository import CreativeSettingRepository

    repo = CreativeSettingRepository(session)
    setting = await repo.get_setting(book_id)
    if not setting:
        return CreativeSettingResponse(book_id=book_id)
    return CreativeSettingResponse.model_validate(setting)


@router.put("/books/{book_id}", response_model=CreativeSettingResponse)
async def update_creative_setting(
    book_id: Annotated[int, Path],
    request: CreativeSettingRequest,
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    data = request.model_dump(by_alias=False, exclude_none=True)
    from .repository import CreativeSettingRepository

    repo = CreativeSettingRepository(session)
    setting = await repo.save_setting(book_id, data)
    if not setting:
        raise HTTPException(status_code=500, detail="保存设定失败")
    return CreativeSettingResponse.model_validate(setting)
