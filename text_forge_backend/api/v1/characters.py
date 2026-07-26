from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from core.auth import get_current
from service.character import CharacterService, character_db
from schema.response.projiect import CharacterResponse, ListCharactersResponse
from schema.request.character import CharacterRequest, CharacterUpdateRequest
import os

router = APIRouter(prefix="/characters", tags=["角色"])


@router.get("/", response_model=ListCharactersResponse)
async def list_characters(
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
    project_id: Annotated[int | None, Query(description="项目ID，可选")] = None,
):
    characters = await character_service.get_user_characters(
        user_id=user_id, project_id=project_id
    )
    return ListCharactersResponse(characters=characters)


@router.post("/", response_model=CharacterResponse)
async def create_character(
    request: CharacterRequest,
    user_id: Annotated[int, Depends(get_current)],
    character_service: Annotated[CharacterService, Depends(character_db)],
):
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
    deleted = await character_service.delete_character(
        user_id=user_id, character_id=id
    )
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
    return {"avatar_url": character.avatar or ""}


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
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                "static",
            )
            file_path = os.path.join(save_dir, os.path.basename(old_avatar))
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass
    return {}
