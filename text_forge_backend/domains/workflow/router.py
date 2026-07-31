from typing import Annotated
from fastapi import APIRouter, Depends, Path
from fastapi.responses import StreamingResponse
from core.auth import get_current
from sqlalchemy.ext.asyncio import AsyncSession
from shared.database import db_manager
from domains.workflow.service import WorkflowService, workflow_db
from schema.response.workflow import ListWorkflowsResponse, WorkflowDetailResponse
from schema.request.workflow import Workflow, WorkflowRunRequest
from domains.workflow.executor import WorkflowExecutor

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


@router.delete("/{id}")
async def delete_workflow(
    id: Annotated[str, Path(description="流水线ID")],
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    status = await workflow_service.delete_workflow(id, user_id)
    return {"ok": status}


@router.post("/{id}/run")
async def run_workflow(
    id: Annotated[str, Path(description="流水线ID")],
    request: WorkflowRunRequest,
    user_id: Annotated[int, Depends(get_current)],
    session: AsyncSession = Depends(db_manager.get_db),
):
    executor = WorkflowExecutor(session)
    return StreamingResponse(
        executor.run(
            workflow_id=id,
            user_id=user_id,
            book_id=request.book_id,
            thread_id=request.thread_id,
        ),
        media_type="text/event-stream",
    )
