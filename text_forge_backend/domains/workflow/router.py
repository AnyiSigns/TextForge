import asyncio
import json
from typing import Annotated

from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from domains.agent.workflow_scheduler import run_workflow as scheduler_run_workflow

from schema.response.workflow import ListWorkflowsResponse, WorkflowDetailResponse
from schema.workflow import Workflow

from .service import WorkflowService, workflow_db

router = APIRouter(prefix="/workflows", tags=["Workflow"])


class ExecuteWorkflowRequest(BaseModel):
    """工作流执行请求体。"""

    workflow_id: str = Field(description="工作流 ID（含内置模板 id）")
    book_id: int = Field(description="目标书籍 ID")
    model_config_data: dict | None = Field(default=None, description="用户模型配置（含 main_config 等）")
    target_chapter_id: int | None = Field(
        default=None, alias="targetChapterId",
        description="目标章节 ID；传入后会把本章写作目标（标题/摘要/前章衔接/关联事件）注入各节点上下文",
    )


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


@router.post("/run")
async def run_workflow_endpoint(
    body: ExecuteWorkflowRequest,
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    """直接执行完整工作流（不走 Agent LLM 决策，确定性执行）。

    通过 SSE 流式推送 node_start / node_end / node_fail 事件，
    结束时推送 type=done 携带完整结果。
    """
    workflow_id = body.workflow_id
    # 校验工作流存在且用户可访问（内置模板对所有用户可见）
    await workflow_service.get_workflow_detail(workflow_id, user_id)
    if not body.book_id:
        raise HTTPException(status_code=400, detail="未选择活动书籍")
    model_config = body.model_config_data or {}
    if not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(event: dict):
            queue.put_nowait(event)

        task = asyncio.create_task(
            scheduler_run_workflow(
                workflow_id=workflow_id,
                book_id=body.book_id,
                model_config=model_config,
                on_progress=on_progress,
                target_chapter_id=body.target_chapter_id,
            )
        )

        while True:
            try:
                event = queue.get_nowait()
            except asyncio.QueueEmpty:
                if task.done():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    if task.done():
                        break
                    continue
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        result = (
            task.result()
            if not task.cancelled()
            else {"status": "error", "message": "执行已取消"}
        )
        yield f"data: {json.dumps({'type': 'done', 'result': result}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )



