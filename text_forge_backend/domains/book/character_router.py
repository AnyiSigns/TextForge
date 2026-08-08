import os
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, UploadFile
from schema.request.character import CharacterRequest, CharacterUpdateRequest
from schema.response.book import (
    CharacterResponse,
    ListCharactersResponse,
)
from shared.database import db_manager
from sqlalchemy.ext.asyncio import AsyncSession

from .character_service import CharacterService, character_db

logger = get_logger(__name__)

router = APIRouter(prefix="/characters", tags=["角色"])


@router.get("/", response_model=ListCharactersResponse)
async def list_characters(
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
    book_id: Annotated[int | None, Query(description="书籍ID，可选")] = None,
):
    characters = await character_service.get_user_characters(
        user_id=user_id, book_id=book_id
    )
    return ListCharactersResponse(characters=characters)


@router.post("/", response_model=CharacterResponse)
async def create_character(
    request: CharacterRequest,
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    # 校验书籍归属：book_id 来自请求体，若不校验可向他人书籍注入角色
    from domains.book._owner_check import assert_book_owner

    if request.book_id is not None:
        await assert_book_owner(request.book_id, user_id, session)
    data = request.model_dump(by_alias=False)
    character = await character_service.create_character(user_id=user_id, **data)
    if not character:
        raise HTTPException(status_code=400, detail="创建角色失败")
    return CharacterResponse.model_validate(character)


@router.get("/{id}", response_model=CharacterResponse)
async def character_detail(
    id: Annotated[int, Path(description="角色ID")],
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
    character = await character_service.get_character(user_id=user_id, character_id=id)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return CharacterResponse.model_validate(character)


@router.put("/{id}", response_model=CharacterResponse)
async def update_character(
    id: Annotated[int, Path(description="角色ID")],
    request: CharacterUpdateRequest,
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
    data = request.model_dump(by_alias=False, exclude_none=True)
    character = await character_service.update_character(
        user_id=user_id, character_id=id, **data
    )
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return CharacterResponse.model_validate(character)


@router.delete("/{id}")
async def delete_character(
    id: Annotated[int, Path(description="角色ID")],
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
    deleted = await character_service.delete_character(user_id=user_id, character_id=id)
    if not deleted:
        raise HTTPException(status_code=404, detail="角色不存在")
    return {}


@router.get("/{id}/avatar")
async def get_character_avatar(
    id: Annotated[int, Path(description="角色ID")],
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
    character = await character_service.get_character(user_id=user_id, character_id=id)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return {"avatarUrl": character.avatar_url or ""}


@router.post("/{id}/avatar")
async def upload_character_avatar(
    id: Annotated[int, Path(description="角色ID")],
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
    file: UploadFile = File(...),
):
    character = await character_service.get_character(user_id=user_id, character_id=id)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return await character_service.upload_character_avatar(
        character_id=id, file=file
    )


@router.delete("/{id}/avatar")
async def delete_character_avatar(
    id: Annotated[int, Path(description="角色ID")],
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
    old_avatar = await character_service.delete_character_avatar(
        user_id=user_id, character_id=id
    )
    if old_avatar is None:
        raise HTTPException(status_code=404, detail="角色不存在")
    if old_avatar and old_avatar.startswith("/static/"):
        try:
            save_dir = os.path.join(
                os.path.dirname(
                    os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                ),
                "static",
            )
            file_path = os.path.join(save_dir, os.path.basename(old_avatar))
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError as exc:
            logger.warning(f"删除旧头像文件失败: {exc}")
    return {}
