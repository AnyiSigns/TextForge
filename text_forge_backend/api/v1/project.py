from typing import Annotated, List
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from sqlalchemy import select
from core.auth import get_current
from service.project import BookService, book_db
from schema.response.projiect import (
    ListCharactersResponse,
    BookResponse,
    BookDetailResponse,
)
from schema.request.project import (
    CreativeSettingRequest,
    BookRequest,
    UpdateBookRequest,
)

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
        id,
        workflow_id=request.workflow_id,
        title=request.title,
        description=request.description,
        genre=request.genre,
    )
    if not instance:
        raise HTTPException(status_code=404, detail="书籍不存在")
    if instance.user_id != user_id:
        raise HTTPException(status_code=401, detail="用户不匹配")
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
