from typing import Annotated

from core.auth import get_current
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from models.book import Book, Chapter, SceneEvent, Volume
from schema.request.book import (
    BookRequest,
    CreativeSettingRequest,
    UpdateBookRequest,
)
from schema.response.book import (
    BookResponse,
    SceneEventResponse,
    ChapterResponse,
    CreativeSettingResponse,
    VolumeResponse,
)
from schema.response.book import (
    BookDetailResponse,
    BookResponse,
    ListCharactersResponse,
)
from shared.database import db_manager
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .chapter_service import ChapterService, chapter_db
from .context_config_repository import BookContextConfigRepository
from .service import BookService, book_db
from .volume_service import VolumeService, volume_db

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
        raise HTTPException(status_code=404, detail="书籍不存在或无权删除")
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
        vol_data = VolumeResponse.model_validate(vol).model_dump(by_alias=True)
        ch_stmt = (
            select(Chapter)
            .where(Chapter.volume_id == vol.id)
            .order_by(Chapter.sort_order, Chapter.id)
        )
        ch_res = await session.execute(ch_stmt)
        vol_data["chapters"] = [
            ChapterResponse.model_validate(c).model_dump(by_alias=True)
            for c in ch_res.scalars().all()
        ]
        tree.append(vol_data)
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

    vol_stmt = select(Volume).where(Volume.book_id == id).order_by(Volume.sort_order, Volume.id)
    v_res = await session.execute(vol_stmt)
    volumes = []
    for v in v_res.scalars().all():
        volumes.append(VolumeResponse.model_validate(v).model_dump(by_alias=True))

    ch_stmt = (
        select(Chapter)
        .where(Chapter.volume_id.in_([v["id"] for v in volumes]))
        .order_by(Chapter.sort_order, Chapter.id)
    )
    ch_res = await session.execute(ch_stmt)
    chapters = []
    chapter_ids = []
    for ch in ch_res.scalars().all():
        chapters.append(ChapterResponse.model_validate(ch).model_dump(by_alias=True))
        chapter_ids.append(ch.id)

    nodes = []
    if chapter_ids:
        node_stmt = (
            select(SceneEvent)
            .where(SceneEvent.chapter_id.in_(chapter_ids))
            .order_by(SceneEvent.sort_order.id)
        )
        node_res = await session.execute(node_stmt)
        for n in node_res.scalars().all():
            nodes.append(SceneEventResponse.model_validate(n).model_dump(by_alias=True))

    return {"volumes": volumes, "chapters": chapters, "nodes": nodes}


@router.patch("/{id}/chapters/{chapter_id}/lock")
async def toggle_chapter_lock(
    id: Annotated[int, Path(description="书籍ID")],
    chapter_id: Annotated[int, Path(description="章节ID")],
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
    body: Annotated[dict, Body(...)],
):
    stmt = select(Book).where(Book.id == id, Book.user_id == user_id)
    res = await session.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    ch_stmt = select(Chapter).where(Chapter.id == chapter_id)
    ch_res = await session.execute(ch_stmt)
    chapter = ch_res.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    chapter.locked = body.get("locked", not chapter.locked)
    await session.commit()
    return {"id": chapter_id, "locked": chapter.locked}


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
