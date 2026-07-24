from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from core.auth import get_current
from service.workflow import WorkflowService, workflow_db
from schema.response.workflow import ListWorkflowsResponse, WorkflowDetailResponse

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
    id: Annotated[int, Path(description="流水线ID")],
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    instance = await workflow_service.get_workflow_detail(id, user_id)
    return WorkflowDetailResponse(workflow=instance)
