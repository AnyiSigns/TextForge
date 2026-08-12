import asyncio
import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from domains.agent.workflow_scheduler import run_workflow as scheduler_run_workflow
from schema.request.common import PersonalRagHit
from schema.response.workflow import ListWorkflowsResponse, WorkflowDetailResponse
from schema.workflow import Workflow
from shared.database import db_manager
from shared.utils import redact_sensitive

from .service import WorkflowService, workflow_db

router = APIRouter(prefix="/workflows", tags=["Workflow"])


class ExecuteWorkflowRequest(BaseModel):
    """工作流执行请求体。"""

    # populate_by_name：允许请求体用 snake_case 字段名（target_chapter_id），
    # 与其余字段风格一致，避免 alias 导致的静默失效。
    model_config = ConfigDict(populate_by_name=True)

    workflow_id: str = Field(description="工作流 ID（含内置模板 id）")
    book_id: int = Field(description="目标书籍 ID")
    model_config_data: dict | None = Field(default=None, description="用户模型配置（含 main_config 等）")
    target_chapter_id: int | None = Field(
        default=None, alias="targetChapterId",
        description="目标章节 ID；传入后会把本章写作目标（标题/摘要/前章衔接/关联事件）注入各节点上下文",
    )
    # 个人库检索结果（{doc_name, content, score} 列表）：与 agent 对话路径同源，
    # 经 scheduler_run_workflow 注入每个节点上下文（个人知识库增强写作）。
    personal_rag_results: list[PersonalRagHit] | None = Field(
        default=None, alias="personalRagResults", max_length=5
    )


@router.get("/", response_model=ListWorkflowsResponse)
async def get_list_workflows(
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    result = await workflow_service.get_list_workflow(user_id)
    return ListWorkflowsResponse(workflows=result)


@router.post("/", response_model=WorkflowDetailResponse)
async def create_workflow(
    request: Workflow,
    user_id: Annotated[int, Depends(get_current)],
    workflow_service: Annotated[WorkflowService, Depends(workflow_db)],
):
    """创建工作流（REST 语义：集合路径用 POST 创建，PUT 仅更新已存在资源）。

    前端新建工作流可能不带 id（或 id 为空字符串）：此处统一生成服务端 id，
    避免前端把 PUT 发到集合路径 /workflows/ 触发 405。
    """
    data = request.model_dump()
    if not data.get("id"):
        data["id"] = f"wf-{uuid.uuid4().hex[:12]}"
    instance = await workflow_service.create_workflow(user_id, data)
    return WorkflowDetailResponse(workflow=instance)


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
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
    request: Request,
):
    """直接执行完整工作流（不走 Agent LLM 决策，确定性执行）。

    通过 SSE 流式推送 node_start / node_end / node_fail 事件，
    结束时推送 type=done 携带完整结果。

    注意：内部/测试用端点——前端 UI 不直接调用（工作流执行经 Agent 子图
    execute_workflow 工具走 /agent/stream），保留供测试/脚本/CLI 使用。
    """
    workflow_id = body.workflow_id
    # 校验工作流存在且用户可访问（内置模板对所有用户可见）
    await workflow_service.get_workflow_detail(workflow_id, user_id)
    if not body.book_id:
        raise HTTPException(status_code=400, detail="未选择活动书籍")
    # 校验书籍归属：body.book_id 来自请求体，若不校验，任何登录用户都可对
    # 他人书籍执行工作流（把他人大纲/角色等数据注入 LLM 上下文）。
    from domains.book._owner_check import assert_book_owner

    await assert_book_owner(body.book_id, user_id, session)
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
                personal_rag_results=(
                    [r.model_dump() for r in body.personal_rag_results]
                    if body.personal_rag_results
                    else None
                ),
            )
        )

        try:
            while True:
                # 客户端断开时立即取消后台任务，避免任务继续占用 LLM/DB 资源
                if await request.is_disconnected():
                    task.cancel()
                    break
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
                # 统一 SSE 事件命名：scheduler 事件用 event 键（node_start 等），
                # 与 agent 流的 type 键不一致；补发 type 字段，前端两种读取均兼容。
                if isinstance(event, dict) and "type" not in event and "event" in event:
                    event = {**event, "type": event["event"]}
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            try:
                result = (
                    task.result()
                    if not task.cancelled()
                    else {"status": "error", "message": "执行已取消"}
                )
            except Exception as exc:
                # 任务异常兜底：异常穿透 task.result() 会打断 SSE 流，
                # 统一转为 done+error 事件，前端可正常收尾展示。
                result = {"status": "error", "message": f"工作流执行异常: {redact_sensitive(str(exc))}"}
            # 统一 SSE 事件命名：scheduler 事件用 event 键（node_start 等），
            # 与 agent 流的 type 键不一致；补发 type 字段，前端两种读取均兼容。
            yield f"data: {json.dumps({'type': 'done', 'result': result}, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            # 流被中断（连接关闭）时取消任务并重新抛出，交给 Starlette 收尾
            task.cancel()
            raise
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )



