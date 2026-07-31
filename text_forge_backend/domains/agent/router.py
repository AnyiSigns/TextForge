import json
import uuid
from typing import Annotated
from .agent_state import UserAgentState
from .graphs.agent_graph import build_user_agent_graph
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from shared.database import db_manager
from shared.redis import redis_client
from models.book import Book
from models.conversation import Conversation, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


async def _get_conversation(
    session: AsyncSession, thread_id: str, user_id: int
) -> Conversation | None:
    stmt = select(Conversation).where(
        Conversation.thread_id == thread_id, Conversation.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def _acquire_book_lock(book_id: int, user_id: int) -> tuple[bool, str]:
    if not book_id:
        return (True, "")
    try:
        key = f"agent:book_lock:{user_id}:{book_id}:{uuid.uuid4().hex}"
        result = await redis_client.set(key, "1", ex=3600, nx=True)
        return (result is True, key)
    except Exception as exc:
        logger.error(f"获取书籍锁失败: {exc}")
        return (False, "")


async def _release_book_lock(book_id: int, user_id: int, lock_key: str | None = None):
    if not book_id:
        return
    try:
        if lock_key:
            await redis_client.delete(lock_key)
        else:
            pattern = f"agent:book_lock:{user_id}:{book_id}:*"
            keys = []
            async for key in redis_client.scan_iter(pattern):
                keys.append(key)
            if keys:
                await redis_client.delete(*keys)
    except Exception as exc:
        logger.error(f"释放书籍锁失败: {exc}")


async def _prepare_agent_state(
    session: AsyncSession,
    user_id: int,
    thread_id: str,
    message: str,
    model_config: dict,
) -> tuple[Conversation, UserAgentState]:
    """准备 Agent 运行状态。

    包括会话校验、用户消息持久化、模型配置加载和上一章上下文构建。

    Args:
        session: SQLAlchemy 异步会话。
        user_id: 用户 ID。
        thread_id: 对话线程 ID。
        message: 用户消息内容。
        model_config: 模型配置字典。

    Returns:
        (Conversation, UserAgentState) 元组。

    Raises:
        HTTPException: 会话不存在时抛出 404。
    """
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    book_id = conversation.book_id or 0
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=message,
    )
    session.add(user_msg)
    await session.commit()
    state: UserAgentState = {
        "messages": [{"type": "human", "content": message}],
        "user_id": user_id,
        "active_book_id": book_id,
        "model_config": model_config,
        "step_outputs": {},
        "previous_chapter_summary": None,
        "previous_chapter_content": None,
        "cross_chapter_context": {},
    }
    if book_id:
        try:
            from .tools.generate_chapter_tool import _get_previous_chapter_context

            prev_ctx = await _get_previous_chapter_context(session, book_id, 0)
            state["previous_chapter_summary"] = prev_ctx.get("previous_chapter_summary")
            state["previous_chapter_content"] = prev_ctx.get("previous_chapter_content")
            state["cross_chapter_context"] = prev_ctx.get("cross_chapter_context", {})
        except Exception as exc:
            logger.warning(f"查询上一章上下文失败: {exc}")
    return conversation, state


@router.post("/start")
async def start_agent_session(
    user_id: Annotated[int, Depends(get_current)],
    book_id: int | None = Query(default=None),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
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


@router.post("/respond")
async def respond_to_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str = Query(...),
    message: str = Query(...),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = {}
    try:
        from domains.model.service import ModelService

        model_config = await ModelService.get_user_model_config(session, user_id)
    except Exception as exc:
        logger.warning(f"获取模型配置失败: {exc}")
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    locked = False
    book_id = None
    try:
        conversation, state = await _prepare_agent_state(
            session, user_id, thread_id, message, model_config
        )
        book_id = conversation.book_id or 0
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(db_manager.get_db, model_config=model_config)
        try:
            result = await graph.ainvoke(state)
        except Exception as exc:
            logger.error(f"agent respond 失败: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Agent 执行失败: {exc}")
        final_messages = result.get("messages", [])
        ai_message = ""
        for msg in reversed(final_messages):
            content = getattr(msg, "content", None)
            if content:
                ai_message = content
                break
        if not ai_message and final_messages:
            ai_message = str(final_messages[-1])
        return {"reply": ai_message, "thread_id": thread_id}
    finally:
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key)


@router.get("/stream/{thread_id}")
async def stream_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str,
    message: str = Query(...),
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = {}
    try:
        from domains.model.service import ModelService

        model_config = await ModelService.get_user_model_config(session, user_id)
    except Exception as exc:
        logger.warning(f"获取模型配置失败: {exc}")
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    locked = False
    book_id = None
    try:
        conversation, state = await _prepare_agent_state(
            session, user_id, thread_id, message, model_config
        )
        book_id = conversation.book_id or 0
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(db_manager.get_db, model_config=model_config)

        async def cleanup():
            if book_id:
                await _release_book_lock(book_id, user_id, lock_key)

        async def event_generator():
            try:
                final_reply = ""
                async for event in graph.astream_events(state, version="v1"):
                    event_type = event.get("event")
                    if event_type == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and hasattr(chunk, "content"):
                            token = chunk.content
                            if token:
                                final_reply += token
                                yield f"data: {json.dumps({'token': token, 'type': 'token'}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_tool_start":
                        tool_name = event.get("name", "")
                        if tool_name == "generate_chapter":
                            yield f"data: {json.dumps({'type': 'progress', 'step': 'generate_chapter', 'n': 1, 'total': 4, 'words': 0, 'eta': 0}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_tool_end":
                        tool_name = event.get("name", "")
                        output = event.get("data", {}).get("output", {})
                        if tool_name == "generate_chapter" and isinstance(output, dict):
                            progress_events = output.get("progress_events", [])
                            for prog in progress_events:
                                yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'type': 'tool_end'}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_chain_end":
                        output = event.get("data", {}).get("output", {})
                        messages = (
                            output.get("messages", [])
                            if isinstance(output, dict)
                            else []
                        )
                        reply = ""
                        for msg in reversed(messages):
                            content = getattr(msg, "content", None)
                            if content:
                                reply = content
                                break
                        if not reply:
                            reply = final_reply
                        if reply:
                            ai_msg = Message(
                                conversation_id=conversation.id,
                                role="assistant",
                                content=reply,
                            )
                            session.add(ai_msg)
                            await session.commit()
                        try:
                            from .tools.feedback_tools import (
                                _build_feedback_tools,
                            )

                            suggestion_tools = _build_feedback_tools(
                                db_manager.get_db, model_config=model_config
                            )
                            suggestions = await suggestion_tools["proactive_suggestions"](
                                user_id=user_id, book_id=book_id
                            )
                            if suggestions:
                                yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions}, ensure_ascii=False)}\n\n"
                        except Exception as exc:
                            logger.warning(f"SSE 推送建议失败: {exc}")
                        yield f"data: {json.dumps({'type': 'end', 'reply': reply}, ensure_ascii=False)}\n\n"
                        break
            except Exception as exc:
                logger.error(f"stream agent 失败: {exc}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"
            finally:
                await cleanup()

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except Exception:
        await cleanup()
        raise
