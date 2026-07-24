from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from service.workflow import WorkflowService, workflow_db
from schema.response.workflow import ListWorkflowsResponse, WorkflowDetailResponse
from schema.request.workflow import WorkflowDetailRequest, Workflow

router = APIRouter(prefix="/workflows", tags=["Workflow"])


@router.get("/", response_model=ListWorkflowsResponse)
async def get_list_workflows(
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    result = await workflow_service.get_list_workflow(user_id)
    return ListWorkflowsResponse(workflows=result)


@router.get("/{id}", response_model=WorkflowDetailResponse)
async def get_workflow_id(
    id: Annotated[str, Path(description="流水线ID")],
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    instance = await workflow_service.get_workflow_detail(id, user_id)
    return WorkflowDetailResponse(workflow=instance)


@router.put("/{id}", response_model=WorkflowDetailResponse)
async def save_workflow(
    id: Annotated[str, Path(description="流水线ID")],
    request: Workflow,
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    instance = await workflow_service.put_workflow(id, user_id, request.model_dump())
    return WorkflowDetailResponse(workflow=instance)
