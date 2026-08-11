import uuid
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Query
from models.book import Book
from models.conversation import Conversation, Message
from schema.request.common import ReviewActionRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.ratelimit import rate_limit_review_action, rate_limit_start
from shared.redis import redis_client
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# 旧导入路径兼容（main.py / 测试沿用，勿删）：
#   - _stream_tasks：main.py 优雅关闭时取消在途任务
#   - _sse_review_card / _strip_api_key_from_checkpoint：test_agent_plan_v5 直接引用
from .concurrency import _stream_tasks
from .graphs.agent_graph import build_user_agent_graph
from .session import (
    _get_conversation,
    _strip_api_key_from_checkpoint,
)
from .sse_events import _sse_review_card

__all__ = [
    "_sse_review_card",
    "_stream_tasks",
    "_strip_api_key_from_checkpoint",
    "router",
]

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


@router.get("/conversations", response_model=list[HistoryResponse])
async def list_conversations(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    stmt = select(Conversation).where(Conversation.user_id == user_id)
    if book_id is not None:
        stmt = stmt.where(Conversation.book_id == book_id)
    stmt = stmt.order_by(Conversation.update_at.desc())
    result = await session.execute(stmt)
    conversations = result.scalars().all()
    return [HistoryResponse.model_validate(c) for c in conversations]


@router.get("/conversations/{conv_id}/messages", response_model=list[MessagesResponse])
async def list_messages(
    conv_id: int,
    user_id: Annotated[int, Depends(get_current)],
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    conv_stmt = select(Conversation).where(
        Conversation.id == conv_id, Conversation.user_id == user_id
    )
    conv_result = await session.execute(conv_stmt)
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    stmt = (
        select(Message)
        .where(Message.conversation_id == conv_id)
        # 任务 23：从最新往回分页（offset 指最新之前的条数）。
        # create_at + id 双键保证同时间戳多条消息的排序稳定，offset 分页不重复/不遗漏。
        .order_by(Message.create_at.desc(), Message.id.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    messages = result.scalars().all()
    # 恢复时间正序，前端直接追加即可
    return [
        MessagesResponse.model_validate(m)
        for m in sorted(messages, key=lambda x: (x.create_at, x.id))
    ]


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    from sqlalchemy import delete as sqla_delete

    conv_stmt = select(Conversation).where(
        Conversation.id == conv_id, Conversation.user_id == user_id
    )
    conv_result = await session.execute(conv_stmt)
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    await session.execute(
        sqla_delete(Message).where(Message.conversation_id == conv_id)
    )
    await session.delete(conversation)
    await session.commit()
    return {"ok": True}


@router.patch("/conversations/{conv_id}")
async def rename_conversation(
    conv_id: int,
    user_id: Annotated[int, Depends(get_current)],
    body: dict,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """任务 23：会话手动重命名。

    body: {"title": "新标题"}。标题为空/非字符串/超长（>200）返回 422 具体错误，
    符合错误信息具体化约束。
    """
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        raise HTTPException(status_code=422, detail="会话标题不能为空")
    title = title.strip()
    if len(title) > 200:
        raise HTTPException(status_code=422, detail="会话标题不能超过 200 字")
    conv_stmt = select(Conversation).where(
        Conversation.id == conv_id, Conversation.user_id == user_id
    )
    conv_result = await session.execute(conv_stmt)
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    conversation.title = title
    await session.commit()
    return {"ok": True, "title": title}


@router.get("/book-lock")
async def get_book_lock_status(
    book_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """查询书籍当前是否被 Agent 任务占用（锁状态）。

    Args:
        book_id: 书籍 ID（须为当前用户所有）。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        含 locked / holder / ttl 的字典；查询失败时按未占用处理。
    """
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        ttl = await redis_client.ttl(key)
        holder = await redis_client.get(key)
        return {"locked": ttl is not None and ttl > 0, "holder": holder, "ttl": ttl}
    except Exception as exc:
        logger.error(f"查询书籍锁失败: {exc}")
        return {"locked": False, "holder": None, "ttl": None}


@router.delete("/book-lock")
async def force_release_book_lock(
    book_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """强制释放书籍的 Agent 任务锁（仅限用户自己的书籍）。

    用于锁残留场景（如上一轮任务被中断且未正常清理）。注意：若确有其他
    任务正在执行，强制释放会使其与新任务并发写书，前端需在用户确认无任务
    运行时才调用。

    Args:
        book_id: 书籍 ID（须为当前用户所有）。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        释放结果。
    """
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        await redis_client.delete(key)
        return {"ok": True, "released": True}
    except Exception as exc:
        logger.error(f"强制释放书籍锁失败: {exc}")
        return {"ok": False, "released": False}


@router.post("/start")
async def start_agent_session(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
    _rl: None = Depends(rate_limit_start),
):
    if book_id is not None:
        stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
        result = await session.execute(stmt)
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
    thread_id = str(uuid.uuid4())
    conversation = Conversation(
        user_id=user_id,
        book_id=book_id,
        type="user_agent",
        thread_id=thread_id,
        title="新对话",
    )
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return {"thread_id": thread_id, "book_id": book_id, "type": "user_agent"}


@router.patch("/state/{thread_id}")
async def patch_state(
    thread_id: str,
    body: dict,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """预留/测试用（N8）：直接改 checkpoint 状态（白名单键），主链路不使用。"""
    # 先校验会话归属：thread_id 来自路径，若不校验可越权读写他人会话的 checkpoint 状态
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    ALLOWED_STATE_KEYS = {
        "personal_rag_results",
        "active_workflow_id",
        "workflow_node_outputs",
    }
    filtered = {k: v for k, v in body.items() if k in ALLOWED_STATE_KEYS}

    config = {"configurable": {"thread_id": thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:
        raise HTTPException(status_code=404, detail="未找到会话状态")

    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config={},
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(config, values=filtered)
    return {"status": "ok", "thread_id": thread_id}


@router.post("/review-action")
async def review_action(
    user_id: Annotated[int, Depends(get_current)],
    body: ReviewActionRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
    _rl: None = Depends(rate_limit_review_action),
):
    conversation = await _get_conversation(session, body.thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    config = {"configurable": {"thread_id": body.thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:
        raise HTTPException(status_code=404, detail="未找到会话状态")

    state_data = state_snapshot.get("channel_values", {})
    review_values: dict = {"review_decision": body.action}
    if body.action == "edit" and body.edited_content is not None:
        review_values["edited_content"] = body.edited_content
    if body.action == "terminate":
        review_values["active_workflow_id"] = None
        if body.chapter_id is not None:
            review_values["terminate_chapter_id"] = body.chapter_id

    model_config = state_data.get("model_config", {})
    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config=model_config,
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(config, values=review_values)
    # 任务 29 写操作审计：记录用户的审核卡决策（接受/重试/修改/终止）。
    # pending_review 的写工具决策在 gated_tool_node 执行时另行留痕；
    # 这里补记工作流审核卡决策。注意：写工具卡 build_preview 也复用 node_id=tool_name，
    # 必须用 workflow_id 区分——只有真·工作流审核卡才在此记录，避免写工具决策被重复
    # 记成 operation="workflow.review" 的错标行。
    try:
        _pr = state_data.get("pending_review") or {}
        _wf_id = _pr.get("workflow_id")
        _node_name = _pr.get("node_id") or ""
        if _wf_id and _node_name:
            from .metrics import record_write_audit

            await record_write_audit(
                db_manager.with_db,
                thread_id=body.thread_id,
                user_id=user_id,
                book_id=conversation.book_id,
                tool_name=_node_name,
                operation="workflow.review",
                args={"node_id": _pr.get("node_id"), "workflow_id": _wf_id},
                decision=body.action,
                result="",
                meta={"edited": bool(body.edited_content)},
            )
    except Exception as exc:
        logger.warning(f"[audit] review_action 审计失败: {exc}")
    return {"status": "ok", "action": body.action}


@router.get("/audits")
async def list_write_audits(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """查询写操作审计记录（任务 29 审计闭环的读取端）。

    原审计只写不读，无法追溯谁在何时改了什么；此端点按用户（可选书籍）倒序
    返回最近审计行，供管理/调试/安全审计消费。
    """
    from models.agent_audit import AgentWriteAudit

    stmt = (
        select(AgentWriteAudit)
        .where(AgentWriteAudit.user_id == user_id)
        .order_by(AgentWriteAudit.id.desc())
        .limit(limit)
    )
    if book_id:
        stmt = stmt.where(AgentWriteAudit.book_id == book_id)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "thread_id": r.thread_id,
            "book_id": r.book_id,
            "tool_name": r.tool_name,
            "operation": r.operation,
            "decision": r.decision,
            "result": r.result,
            "args_summary": r.args_summary,
            "meta": r.meta,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/turn-metrics")
async def list_turn_metrics(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """查询回合指标记录（任务 28 指标落库的读取端，供统计/面板消费）。"""
    from models.agent_metric import AgentTurnMetric

    stmt = (
        select(AgentTurnMetric)
        .where(AgentTurnMetric.user_id == user_id)
        .order_by(AgentTurnMetric.id.desc())
        .limit(limit)
    )
    if book_id:
        stmt = stmt.where(AgentTurnMetric.book_id == book_id)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "thread_id": r.thread_id,
            "subgraph": r.subgraph,
            "duration_ms": r.duration_ms,
            "llm_calls": r.llm_calls,
            "tool_calls": r.tool_calls,
            "tool_success": r.tool_success,
            "tool_fail": r.tool_fail,
            "compress_count": r.compress_count,
            "approval_count": r.approval_count,
            "approval_accept": r.approval_accept,
            "details": r.details,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# 底部延迟导入：streaming 端点（stream/respond/cancel/compress）注册到本共享 router，
# 保持 main.py 单一 `router as agent_router` 挂载路径不变。
from . import streaming  # noqa: F401
