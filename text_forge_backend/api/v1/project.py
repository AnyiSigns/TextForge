from typing import Annotated, List
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from core.auth import get_current
from service.project import ProjectService, project_db
from schema.response.projiect import (
    ListCharactersResponse,
    ProjectResponse,
    ProjectVersionResponse,
    ProjectDetailResponse,
)
from schema.request.project import (
    BriefRequest,
    ProjectRequest,
    UpdateProjectRequest,
)

router = APIRouter(prefix="/projects", tags=["Project"])


@router.get("/", response_model=dict)
async def parameter_project(
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
    status: Annotated[str, Query(description="项目状态")] = "draft",
    genre: Annotated[str | None, Query(description="分类")] = None,
):
    result = await project_service.query_user_project(
        user_id, status=status, genre=genre
    )
    return {"projects": [ProjectResponse.model_validate(p) for p in result]}


@router.post("/", response_model=ProjectVersionResponse)
async def create_project(
    request: ProjectRequest,
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    result = await project_service.create_project(
        user_id=user_id,
        title=request.title,
        description=request.description,
        genre=request.genre,
    )
    if not result:
        raise HTTPException(status_code=500, detail="创建新项目失败")
    return ProjectVersionResponse(version=result.version, project=result)


@router.get("/{id}", response_model=ProjectDetailResponse)
async def project_info(
    id: Annotated[int, Path(description="项目ID")],
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    result = await project_service.project_detail(user_id, id)
    if not result:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectDetailResponse(
        project=result["project"],
        characters=result["characters"],
    )


@router.put("/{id}", response_model=ProjectVersionResponse)
async def update_project(
    id: Annotated[int, Path(description="项目ID")],
    request: UpdateProjectRequest,
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    instance = await project_service.update_project(
        id,
        workflow_id=request.workflow_id,
        title=request.title,
        description=request.description,
        genre=request.genre,
    )
    if not instance:
        raise HTTPException(status_code=404, detail="项目不存在")
    if instance.user_id != user_id:
        raise HTTPException(status_code=401, detail="用户不匹配")
    return ProjectVersionResponse(project=instance, version=instance.version)


@router.delete("/{id}")
async def delete_project(
    id: Annotated[int, Path(description="项目ID")],
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    result = await project_service.delete_project(user_id, id)
    if not result:
        raise HTTPException(status_code=404, detail="项目删除失败")
    return {}


@router.get("/{id}/characters", response_model=ListCharactersResponse)
async def project_characters(
    id: Annotated[int, Path(description="项目ID")],
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    result, msg = await project_service.project_characters(user_id, id)
    if msg:
        raise HTTPException(status_code=404, detail=msg)
    return ListCharactersResponse(characters=result)


@router.put("/{id}/brief")
async def project_breif(
    id: Annotated[int, Path],
    brief: Annotated[BriefRequest, Body(embed=True)],
    user_id: Annotated[int, Depends(get_current)],
    project_service: Annotated[ProjectService, Depends(project_db)],
):
    data = brief.model_dump(by_alias=False, exclude_none=True)
    status = await project_service.save_brief(id, user_id, brief=data)
    if not status:
        raise HTTPException(status_code=404, detail="设定保存失败")
    return {"ok", True}
