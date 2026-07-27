from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from infrastructure.database import db_manager
from model.project import Project
from schema.response.outline import OutlineResponse, ListOutlinesResponse
from schema.request.outline import OutlineRequest
from service.outline import OutlineService, outline_db

router = APIRouter(prefix="/outlines", tags=["Outline"])


async def _assert_project_owner(project_id: int, user_id: int, session: AsyncSession):
    stmt = select(Project).where(Project.id == project_id, Project.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="项目不存在或无权访问")


@router.get("/projects/{project_id}", response_model=ListOutlinesResponse)
async def list_outlines(
    project_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
):
    items = await outline_service.list_outlines(project_id)
    return ListOutlinesResponse(outlines=items)


@router.get("/projects/{project_id}/{outline_id}", response_model=OutlineResponse)
async def get_outline(
    project_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
):
    item = await outline_service.get_outline(project_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    return item


@router.post("/projects/{project_id}", response_model=OutlineResponse)
async def create_outline(
    project_id: Annotated[int, Path],
    body: OutlineRequest,
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    await _assert_project_owner(project_id, user_id, session)
    data = {
        k: v
        for k, v in body.model_dump(by_alias=False, exclude_none=True).items()
        if k != "project_id"
    }
    item = await outline_service.create_outline(project_id, **data)
    if not item:
        raise HTTPException(status_code=500, detail="创建大纲失败")
    return item


@router.put("/projects/{project_id}/{outline_id}", response_model=OutlineResponse)
async def update_outline(
    project_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    body: OutlineRequest,
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await outline_service.get_outline(project_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    await _assert_project_owner(project_id, user_id, session)
    data = {
        k: v
        for k, v in body.model_dump(by_alias=False, exclude_none=True).items()
        if k != "project_id"
    }
    item = await outline_service.update_outline(outline_id, **data)
    if item:
        raw_data = data.get("data")
        if raw_data:
            await outline_service.auto_summarize_if_needed(outline_id, project_id, user_id, raw_data)
    return item


@router.delete("/projects/{project_id}/{outline_id}")
async def delete_outline(
    project_id: Annotated[int, Path],
    outline_id: Annotated[int, Path],
    user_id: Annotated[int, Depends(get_current)],
    outline_service: Annotated[OutlineService, Depends(outline_db)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    item = await outline_service.get_outline(project_id, outline_id)
    if not item:
        raise HTTPException(status_code=404, detail="大纲不存在")
    await _assert_project_owner(project_id, user_id, session)
    ok = await outline_service.delete_outline(outline_id)
    return {"ok": ok}
