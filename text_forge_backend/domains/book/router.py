from typing import Annotated

from core.auth import get_current
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from shared.database import db_manager
from models.book import Book, Chapter, Outline, Volume
from .context_config_repository import BookContextConfigRepository
from schema.request.book import (
    BookRequest,
    CreativeSettingRequest,
    UpdateBookRequest,
)
from schema.response.book import (
    BookDetailResponse,
    BookResponse,
    ListCharactersResponse,
)
from .chapter_service import ChapterService, chapter_db
from .service import BookService, book_db
from .volume_service import VolumeService, volume_db
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/books", tags=["Book"])


@router.get("/", response_model=dict)
async def parameter_books(
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
    genre: Annotated[str | None, Query(description="分类")] = None,
):
    result = await book_service.query_user_books(user_id, genre=genre)
    return {"books": [BookResponse.model_validate(b) for b in result]}


@router.post("/", response_model=BookResponse)
async def create_book(
    request: BookRequest,
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    try:
        result = await book_service.create_book(
            user_id=user_id,
            title=request.title,
            description=request.description,
            genre=request.genre,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=500, detail="创建新书籍失败")
    return BookResponse.model_validate(result)


@router.get("/{id}", response_model=BookDetailResponse)
async def book_info(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    result = await book_service.book_detail(user_id, id)
    if not result:
        raise HTTPException(status_code=404, detail="书籍不存在")
    return BookDetailResponse(book=result["book"], characters=result["characters"])


@router.put("/{id}", response_model=BookResponse)
async def update_book(
    id: Annotated[int, Path(description="书籍ID")],
    request: UpdateBookRequest,
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    instance = await book_service.update_book(
        user_id,
        id,
        workflow_id=request.workflow_id,
        title=request.title,
        description=request.description,
        genre=request.genre,
    )
    if not instance:
        raise HTTPException(status_code=404, detail="书籍不存在")
    return BookResponse.model_validate(instance)


@router.delete("/{id}")
async def delete_book(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    result = await book_service.delete_book(user_id, id)
    if not result:
        raise HTTPException(status_code=404, detail="书籍删除失败")
    return {}


@router.get("/{id}/characters", response_model=ListCharactersResponse)
async def book_characters(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    result, msg = await book_service.book_characters(user_id, id)
    if msg:
        raise HTTPException(status_code=404, detail=msg)
    return ListCharactersResponse(characters=result)


@router.get("/{id}/volumes", response_model=dict)
async def book_volumes(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    volume_service: Annotated[VolumeService, Depends(volume_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    items = await volume_service.list_volumes(id)
    return {
        "volumes": [
            {
                "id": v.id,
                "title": v.title,
                "summary": v.summary,
                "sort_order": v.sort_order,
            }
            for v in items
        ]
    }


@router.get("/{id}/chapters", response_model=dict)
async def book_chapters_volume_tree(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    chapter_service: Annotated[ChapterService, Depends(chapter_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")

    volume_stmt = (
        select(Volume)
        .where(Volume.book_id == id)
        .order_by(Volume.sort_order, Volume.id)
    )
    volume_res = await session.execute(volume_stmt)
    volumes = volume_res.scalars().all()

    tree = []
    for vol in volumes:
        ch_stmt = (
            select(Chapter)
            .where(Chapter.volume_id == vol.id)
            .order_by(Chapter.sort_order, Chapter.id)
        )
        ch_res = await session.execute(ch_stmt)
        chapters = ch_res.scalars().all()
        tree.append(
            {
                "id": vol.id,
                "title": vol.title,
                "summary": vol.summary,
                "chapters": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "summary": c.summary,
                        "sort_order": c.sort_order,
                    }
                    for c in chapters
                ],
            }
        )
    return {"volumes": tree}


@router.put("/{id}/creative-settings")
async def book_creative_setting(
    id: Annotated[int, Path],
    setting: Annotated[CreativeSettingRequest, Body(embed=True)],
    user_id: Annotated[int, Depends(get_current)],
    book_service: Annotated[BookService, Depends(book_db)],
):
    data = setting.model_dump(by_alias=False, exclude_none=True)
    status = await book_service.save_creative_setting(id, user_id, setting=data)
    if not status:
        raise HTTPException(status_code=404, detail="设定保存失败")
    return {"ok": True}


@router.get("/{id}/outline-tree", response_model=dict)
async def book_outline_tree(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")

    stmt = (
        select(Outline)
        .where(Outline.book_id == id)
        .order_by(Outline.sort_order, Outline.id)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    nodes = []
    for r in rows:
        nodes.append(
            {
                "id": r.id,
                "node_type": r.node_type,
                "title": r.title,
                "content": r.content,
                "parent_id": r.parent_id,
                "target_volume_id": r.target_volume_id,
                "target_chapter_id": r.target_chapter_id,
                "sort_order": r.sort_order,
            }
        )
    return {"nodes": nodes}


@router.get("/{id}/context-config", response_model=dict)
async def get_book_context_config(
    id: Annotated[int, Path(description="书籍ID")],
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    repo = BookContextConfigRepository(session)
    data = await repo.get_config(id)
    return data


@router.put("/{id}/context-config", response_model=dict)
async def save_book_context_config(
    id: Annotated[int, Path(description="书籍ID")],
    config: Annotated[dict[str, list[int]], Body(embed=False)],
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    repo = BookContextConfigRepository(session)
    data = await repo.save_config(id, config or {})
    return data
