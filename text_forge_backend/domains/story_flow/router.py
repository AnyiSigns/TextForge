"""剧情流 — 交互式章节剧情推演路由。

SSE 事件命名与 agent 流（node_start/node_stream/...）隔离：
本模块流式事件统一为 scene_stream / scene_done / done / error。
"""
import json
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from models.book import Book, Chapter, Volume
from pydantic import BaseModel, ConfigDict, Field
from shared.database import db_manager
from sqlalchemy.ext.asyncio import AsyncSession

from . import repository as repo
from . import service

logger = get_logger(__name__)

router = APIRouter(prefix="/story-flows", tags=["剧情流"])


class CreateStoryFlowRequest(BaseModel):
    """创建剧情流会话请求。"""

    model_config = ConfigDict(populate_by_name=True)

    book_id: int = Field(alias="bookId")
    chapter_id: int = Field(alias="chapterId")
    view_character_id: int | None = Field(default=None, alias="viewCharacterId")
    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class AdvanceStoryFlowRequest(BaseModel):
    """推进剧情流请求。"""

    model_config = ConfigDict(populate_by_name=True)

    chosen_option: str = Field(alias="chosenOption")
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
    # 前端提交时携带的「最新节点 seq」乐观锁：与后端实际最新 seq 不一致时
    # 拒绝提交（回看历史节点误提交/并发推进），防止把选项写到错误节点。
    node_seq: int | None = Field(default=None, alias="nodeSeq")


class CompleteStoryFlowRequest(BaseModel):
    """结束剧情流请求（summary 生成依赖模型配置）。"""

    model_config = ConfigDict(populate_by_name=True)

    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class UpdateViewCharacterRequest(BaseModel):
    """更新视角角色请求。"""

    model_config = ConfigDict(populate_by_name=True)

    view_character_id: int | None = Field(alias="viewCharacterId")


def _sse(data: dict) -> str:
    """构造一条 SSE 消息。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_headers() -> dict[str, str]:
    """SSE 响应头（仿 wizard / agent）。"""
    return {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    }


def _check_model_config(model_config: dict) -> None:
    """校验用户模型配置已设置（main 档缺失返回 400）。"""
    if not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")


async def _load_book_chapter(
    session: AsyncSession, book_id: int, chapter_id: int, user_id: int
) -> tuple[Book, Chapter]:
    """加载并校验书籍与章节归属。

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。
        chapter_id: 章节 ID。
        user_id: 当前用户 ID。

    Returns:
        (book, chapter)。

    Raises:
        HTTPException: 书籍/章节不存在或无权访问时抛出。
    """
    book = await session.get(Book, book_id)
    if not book or book.user_id != user_id:
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    chapter = await session.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    volume = await session.get(Volume, chapter.volume_id)
    if not volume or volume.book_id != book_id:
        raise HTTPException(status_code=404, detail="章节不存在或不属于该书")
    return book, chapter


async def _load_own_flow(
    session: AsyncSession, flow_id: int, user_id: int
) -> "repo.StoryFlow":
    """加载并校验剧情流归属。

    Args:
        session: 数据库会话。
        flow_id: 剧情流 ID。
        user_id: 当前用户 ID。

    Returns:
        StoryFlow 会话对象。

    Raises:
        HTTPException: 不存在或无权访问时抛出。
    """
    flow = await repo.get_flow(session, flow_id, user_id)
    if not flow:
        raise HTTPException(status_code=404, detail="剧情流不存在")
    return flow


@router.post("/")
async def create_story_flow(
    user_id: Annotated[int, Depends(get_current)],
    body: CreateStoryFlowRequest | None = None,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """创建剧情流会话并流式生成首场景（SSE，幂等创建）。

    已有该章节 active 流时直接复用；复用且有节点时只回放 scene_done + done。

    Args:
        user_id: 当前用户 ID。
        body: 创建请求（bookId / chapterId / viewCharacterId / modelConfig）。
        session: 数据库会话。

    Returns:
        SSE 事件流：scene_stream → scene_done → done。
    """
    if not body:
        raise HTTPException(status_code=400, detail="缺少请求体")
    model_config = body.model_config_data or {}
    _check_model_config(model_config)

    book, chapter = await _load_book_chapter(session, body.book_id, body.chapter_id, user_id)
    if body.view_character_id is not None:
        valid = await service.validate_view_character(
            session, body.view_character_id, body.book_id
        )
        if not valid:
            raise HTTPException(status_code=400, detail="视角角色不存在或不属于本书")

    async def event_gen():
        try:
            async for event in service.stream_create_flow(
                session=session,
                book=book,
                chapter=chapter,
                view_character_id=body.view_character_id,
                user_id=user_id,
                model_config=model_config,
            ):
                yield _sse(event)
        except Exception:
            logger.exception("[story_flow] 创建剧情流失败")
            yield _sse({"type": "error", "message": "创建剧情流失败，请重试"})

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=_sse_headers())


@router.post("/{flow_id}/advance")
async def advance_story_flow(
    flow_id: int,
    user_id: Annotated[int, Depends(get_current)],
    body: AdvanceStoryFlowRequest | None = None,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """推进剧情流（SSE；幂等——已生成的后续节点直接回放）。

    Args:
        flow_id: 剧情流 ID。
        user_id: 当前用户 ID。
        body: 推进请求（chosenOption / modelConfig）。
        session: 数据库会话。

    Returns:
        SSE 事件流：scene_stream → scene_done → done；序列末尾时
        scene_done（node: null, completed: true）→ done。
    """
    if not body:
        raise HTTPException(status_code=400, detail="缺少请求体")
    model_config = body.model_config_data or {}
    _check_model_config(model_config)

    chosen = (body.chosen_option or "").strip()
    if not chosen:
        raise HTTPException(status_code=400, detail="选项不能为空")

    flow = await _load_own_flow(session, flow_id, user_id)
    if flow.status == "completed":
        raise HTTPException(status_code=400, detail="推演已完成")

    # 乐观锁：前端提交基于的节点 seq 与后端最新节点不一致（回看历史节点误提交、
    # 或多端并发推进）时直接拒绝，避免把历史选项文本写到最新节点污染决策链。
    if body.node_seq is not None:
        last_node = await repo.get_last_node(session, flow.id)
        last_seq = last_node.seq if last_node else 0
        if last_seq != body.node_seq:
            raise HTTPException(status_code=409, detail="场景已推进，请刷新后重试")

    async def event_gen():
        try:
            async for event in service.stream_advance_flow(
                session=session,
                flow=flow,
                chosen_option_text=chosen,
                model_config=model_config,
            ):
                yield _sse(event)
        except Exception:
            logger.exception("[story_flow] 推进剧情流失败")
            yield _sse({"type": "error", "message": "推进失败，请重试"})

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=_sse_headers())


@router.post("/{flow_id}/complete")
async def complete_story_flow(
    flow_id: int,
    user_id: Annotated[int, Depends(get_current)],
    body: CompleteStoryFlowRequest | None = None,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """手动结束剧情流并生成推演摘要（幂等；LLM 失败回退决策链拼接）。

    Args:
        flow_id: 剧情流 ID。
        user_id: 当前用户 ID。
        body: 结束请求（modelConfig，summary 生成依赖模型配置）。
        session: 数据库会话。

    Returns:
        {"summary", "status": "completed", "flowId"}。
    """
    if not body:
        raise HTTPException(status_code=400, detail="缺少请求体")
    model_config = body.model_config_data or {}
    _check_model_config(model_config)

    flow = await _load_own_flow(session, flow_id, user_id)
    summary = await service.complete_flow(
        session=session, flow=flow, model_config=model_config
    )
    return {"summary": summary, "status": "completed", "flowId": flow.id}


@router.get("/{flow_id}")
async def get_story_flow(
    flow_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """获取剧情流会话与全部节点（按 seq 升序，恢复用）。"""
    flow = await _load_own_flow(session, flow_id, user_id)
    nodes = await repo.get_nodes(session, flow.id)
    return {
        "flow": repo.flow_to_dict(flow),
        "nodes": [repo.node_to_dict(n) for n in nodes],
    }


@router.get("/")
async def list_story_flows(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None, alias="bookId"),
    chapter_id: int | None = Query(default=None, alias="chapterId"),
    status: str | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """查询剧情流会话列表（可按 book/chapter/status 过滤，恢复用）。"""
    flows = await repo.list_flows(
        session=session,
        user_id=user_id,
        book_id=book_id,
        chapter_id=chapter_id,
        status=status,
    )
    return {"items": [repo.flow_to_dict(f) for f in flows]}


@router.patch("/{flow_id}")
async def update_story_flow(
    flow_id: int,
    user_id: Annotated[int, Depends(get_current)],
    body: UpdateViewCharacterRequest | None = None,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """更新剧情流视角角色（仅 active 流可改；角色需存在且属于本书）。"""
    if not body:
        raise HTTPException(status_code=400, detail="缺少请求体")
    flow = await _load_own_flow(session, flow_id, user_id)
    if flow.status == "completed":
        raise HTTPException(status_code=400, detail="推演已完成")
    if body.view_character_id is not None:
        valid = await service.validate_view_character(
            session, body.view_character_id, flow.book_id
        )
        if not valid:
            raise HTTPException(status_code=400, detail="视角角色不存在或不属于本书")
    flow.view_character_id = body.view_character_id
    await session.commit()
    return repo.flow_to_dict(flow)


@router.delete("/{flow_id}")
async def delete_story_flow(
    flow_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """删除剧情流会话（节点级联删除）。"""
    flow = await _load_own_flow(session, flow_id, user_id)
    await repo.delete_flow(session, flow)
    await session.commit()
    return {"ok": True}
