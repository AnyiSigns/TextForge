import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import openai
from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from models.book import Book, Chapter, Volume
from models.conversation import Conversation, Message
from schema.request.common import ChatRequest, CompressRequest, ReviewActionRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .agent_state import UserAgentState
from .graphs.agent_graph import build_user_agent_graph

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


async def _get_conversation(
    session: AsyncSession, thread_id: str, user_id: int
) -> Conversation | None:
    """根据 thread_id 和 user_id 查找对应的对话记录。"""
    stmt = select(Conversation).where(
        Conversation.thread_id == thread_id, Conversation.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def _load_recent_messages(
    session: AsyncSession, conversation_id: int, limit: int = 10
) -> list[dict]:
    """加载指定对话的最近消息，按时间正序返回。"""
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.create_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    messages = list(result.scalars().all())
    messages.reverse()
    return [
        {"type": "human" if m.role == "user" else "ai", "content": m.content}
        for m in messages
    ]


async def _acquire_book_lock(book_id: int, user_id: int) -> tuple[bool, str]:
    """为书籍获取分布式锁，返回 (是否获取成功, 锁键)。"""
    if not book_id:
        return (True, "")
    try:
        key = f"agent:book_lock:{user_id}:{book_id}:{uuid.uuid4().hex}"
        result = await redis_client.set(
            key, "1", ex=3600, nx=True
        )  # 锁过期时间，3600秒（1小时），防止长时间占锁
        return (result is True, key)
    except Exception as exc:
        logger.error(f"获取书籍锁失败: {exc}")
        return (False, "")


async def _release_book_lock(book_id: int, user_id: int, lock_key: str | None = None):
    """释放先前获取的书籍分布式锁。"""
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


async def _empty_sse(message: str):
    yield f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps({'type': 'end', 'reply': ''}, ensure_ascii=False)}\n\n"


async def _prepare_agent_state(
    session: AsyncSession,
    user_id: int,
    thread_id: str,
    message: str,
    model_config: dict,
) -> tuple[Conversation, UserAgentState, int]:
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=message,
    )
    session.add(user_msg)
    await session.commit()

    recent_messages = await _load_recent_messages(session, conversation.id, limit=10)

    book_id = conversation.book_id or 0
    state: UserAgentState = {
        "messages": recent_messages,
        "user_id": user_id,
        "active_book_id": book_id,
        "model_config": model_config,
        "step_outputs": {},
        "previous_chapter_summary": None,
        "previous_chapter_content": None,
        "cross_chapter_context": {},
        "compressed_context": None,
        "message_count_at_compress": None,
        "active_workflow_id": None,
        "pending_review": None,
        "review_decision": None,
        "edited_content": None,
        "workflow_node_outputs": {},
        "personal_rag_results": None,
        "terminate_chapter_id": None,
    }

    if book_id:
        try:
            from .chapter_context import get_previous_chapter_context

            latest_chapter_stmt = (
                select(Chapter)
                .where(
                    Chapter.volume_id.in_(
                        select(Volume.id).where(Volume.book_id == book_id)
                    )
                )
                .order_by(Chapter.created_at.desc())
                .limit(1)
            )
            latest_chapter_result = await session.execute(latest_chapter_stmt)
            latest_chapter = latest_chapter_result.scalar_one_or_none()
            latest_chapter_id = latest_chapter.id if latest_chapter else 0

            prev_ctx = await get_previous_chapter_context(
                session, book_id, latest_chapter_id
            )
            state["previous_chapter_summary"] = prev_ctx.get("previous_chapter_summary")
            state["previous_chapter_content"] = prev_ctx.get("previous_chapter_content")
            state["cross_chapter_context"] = prev_ctx.get("cross_chapter_context", {})
        except Exception as exc:
            logger.warning(f"查询上一章上下文失败: {exc}")

    return conversation, state, book_id


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
        .order_by(Message.create_at)
    )
    result = await session.execute(stmt)
    messages = result.scalars().all()
    return [MessagesResponse.model_validate(m) for m in messages]


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
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    locked = False
    book_id = None
    try:
        conversation, state, book_id = await _prepare_agent_state(
            session, user_id, body.thread_id, body.message, model_config
        )
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": body.thread_id}, "recursion_limit": 100}
        try:
            result = await graph.ainvoke(state, config=config)
        except Exception as exc:
            logger.error(f"agent respond 失败: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail="Agent 执行失败")
        final_messages = result.get("messages", [])
        ai_message = ""
        from langchain_core.messages import AIMessage, ToolMessage

        for msg in reversed(final_messages):
            if isinstance(msg, ToolMessage):
                continue
            if isinstance(msg, AIMessage) and msg.tool_calls:
                continue
            content = getattr(msg, "content", None)
            if content:
                ai_message = content
                break
        if not ai_message and final_messages:
            ai_message = str(final_messages[-1])
        return {"reply": ai_message, "thread_id": body.thread_id}
    finally:
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key)


@router.post("/stream/{thread_id}")
async def stream_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str,
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    lock_key = None
    locked = False
    book_id = None

    async def cleanup():
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key)

    try:
        is_resume = not body.message
        if is_resume:
            conversation = await _get_conversation(session, thread_id, user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="会话不存在")
            book_id = conversation.book_id or 0

            checkpoint = graph_pool_manager.checkpoint
            if not checkpoint:
                raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

            state_snapshot = await checkpoint.aget(
                {"configurable": {"thread_id": thread_id}}
            )
            if not state_snapshot:
                raise HTTPException(status_code=404, detail="未找到会话状态")

            state_data = state_snapshot.get("channel_values", {})
            pending_review = state_data.get("pending_review")
            if not pending_review:
                return StreamingResponse(
                    _empty_sse("无待处理的审核，请发送新消息开始对话"),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache, no-transform"},
                )
            review_decision = state_data.get("review_decision", "accept")
            edited_content = state_data.get("edited_content", "")
            node_label = pending_review.get("node_label", "")

            from langchain_core.messages import HumanMessage

            messages = list(state_data.get("messages", []))

            if review_decision == "terminate":
                chapter_id_for_terminate = state_data.get("terminate_chapter_id")
                instruction_parts = []
                if chapter_id_for_terminate:
                    instruction_parts.append(f"target_chapter_id={chapter_id_for_terminate}")
                node_outputs = state_data.get("workflow_node_outputs", {})
                if node_outputs:
                    outputs_text = "\n\n".join([
                        f"[{nid}] {data if isinstance(data, str) else data.get('output', '')[:2000]}"
                        for nid, data in node_outputs.items()
                    ])
                    instruction_parts.append(f"根据以下工作流节点输出生成章节正文：\n\n{outputs_text}")
                messages.append(
                    HumanMessage(
                        content=f"工作流已被用户终止。请根据已完成的节点输出生成最终章节。{' '.join(instruction_parts) if instruction_parts else '请汇总已有输出并给出建议。'}"
                    )
                )
                state = {
                    **state_data,
                    "messages": messages,
                    "pending_review": None,
                    "review_decision": None,
                    "edited_content": None,
                    "terminate_chapter_id": None,
                    "active_workflow_id": None,
                    "workflow_node_outputs": {},
                }
            elif review_decision == "retry":
                messages.append(
                    HumanMessage(
                        content=f"节点 [{node_label}] 的输出被用户拒绝。请调整参数或从不同的角度重新生成，确保输出严格遵循该节点的写作要求。"
                    )
                )
            elif review_decision == "edit" and edited_content:
                messages.append(
                    HumanMessage(
                        content=f"节点 [{node_label}] 的输出已被用户修改为以下内容：\n\n{edited_content}\n\n请基于此修改后的内容继续工作，并相应调整后续节点的上下文。"
                    )
                )
            else:
                messages.append(
                    HumanMessage(
                        content=f"节点 [{node_label}] 的输出已被用户接受。请继续执行下一个节点。"
                    )
                )

            state = {
                **state_data,
                "messages": messages,
                "pending_review": None,
                "review_decision": None,
                "edited_content": None,
            }
        else:
            conversation, state, book_id = await _prepare_agent_state(
                session, user_id, thread_id, body.message, model_config
            )
        if book_id:
            locked, lock_key = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 100}

        async def event_generator():
            try:
                yield ":\n\n"
                final_reply = ""
                tool_called_this_turn = False
                agent_think_buffer: list[str] = []
                think_phase = True
                think_started = False
                async for event in graph.astream_events(
                    state, config=config, version="v2"
                ):
                    event_type = event.get("event")
                    if event_type == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and hasattr(chunk, "content"):
                            reasoning = (
                                getattr(chunk, "reasoning_content", None)
                                or (chunk.additional_kwargs or {}).get("reasoning_content", "")
                                or (chunk.response_metadata or {}).get("reasoning_content", "")
                            )
                            token = chunk.content or ""

                            if reasoning:
                                agent_think_buffer.append(reasoning)
                                if not think_started:
                                    think_started = True
                                    yield f"data: {json.dumps({'type': 'think_start', 'elapsed': 0, 'user_id': user_id}, ensure_ascii=False)}\n\n"

                            if token:
                                if think_phase and agent_think_buffer:
                                    think_phase = False
                                    yield f"data: {json.dumps({'type': 'agent_think_end'}, ensure_ascii=False)}\n\n"
                                    agent_think_buffer.clear()

                                if tool_called_this_turn:
                                    final_reply += token
                                else:
                                    agent_think_buffer.append(token)
                                yield f"data: {json.dumps({'token': token, 'type': 'token'}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_custom_event":
                        custom_name = event.get("name", "")
                        custom_data = event.get("data", {})
                        if custom_name in ("node_start", "node_end", "node_fail", "progress"):
                            yield f"data: {json.dumps({'type': custom_name, **custom_data}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_tool_start":
                        if think_phase and agent_think_buffer:
                            think_phase = False
                            yield f"data: {json.dumps({'type': 'agent_think_end'}, ensure_ascii=False)}\n\n"
                            agent_think_buffer.clear()
                        tool_called_this_turn = True
                        tool_name = event.get("name", "")
                        if tool_name == "generate_chapter":
                            yield f"data: {json.dumps({'type': 'progress', 'step': 'generate_chapter', 'n': 1, 'total': 4, 'words': 0, 'eta': 0}, ensure_ascii=False)}\n\n"
                        elif tool_name == "generate_outline_extension":
                            yield f"data: {json.dumps({'type': 'extend_outline', 'step': 'extend_outline', 'n': 0, 'total': 1}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_tool_end":
                        tool_name = event.get("name", "")
                        output = event.get("data", {}).get("output", {})
                        if tool_name == "generate_chapter" and isinstance(output, dict):
                            progress_events = output.get("progress_events", [])
                            for prog in progress_events:
                                yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                        if tool_name == "generate_outline_extension" and isinstance(output, dict):
                            yield f"data: {json.dumps({'type': 'extend_outline', **output}, ensure_ascii=False)}\n\n"
                        if tool_name == "execute_workflow" and isinstance(output, dict):
                            progress_events = output.get("progress_events", [])
                            for prog in progress_events:
                                event_name = prog.get("event", "progress")
                                yield f"data: {json.dumps({'type': event_name, **{k: v for k, v in prog.items() if k != 'event'}}, ensure_ascii=False)}\n\n"
                            if output.get("status") == "pending_review":
                                node_results = output.get("node_results", [])
                                if node_results:
                                    last = node_results[-1]
                                    qc = last.get("quality_check", {})
                                    pending_review_data = {
                                        "type": "review_card",
                                        "node_id": output.get("pending_node_id", ""),
                                        "node_label": output.get("pending_node_label", ""),
                                        "output_preview": last.get("output", "")[:1000],
                                        "reason": qc.get("reason", ""),
                                        "system_prompt": qc.get("system_prompt", ""),
                                    }
                                    yield f"data: {json.dumps(pending_review_data, ensure_ascii=False)}\n\n"
                        if tool_name == "execute_workflow_node" and isinstance(
                            output, dict
                        ):
                            node_id = output.get("node_id", "")
                            node_label = output.get("node_label", "")
                            yield f"data: {json.dumps({'type': 'node_start', 'node_id': node_id, 'label': node_label}, ensure_ascii=False)}\n\n"
                            for se in output.get("stream_events", []):
                                yield f"data: {json.dumps({'type': 'node_stream', 'node_id': se.get('node_id', ''), 'token': se.get('token', ''), 'index': se.get('index', 0)}, ensure_ascii=False)}\n\n"
                            yield f"data: {json.dumps({'type': 'node_end', 'node_id': node_id, 'output_preview': output.get('output', '')[:500]}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'type': 'tool_end'}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_chain_end":
                        output = event.get("data", {}).get("output", {})
                        if isinstance(output, dict):
                            pending_review = output.get("pending_review")
                            if pending_review and isinstance(pending_review, dict):
                                yield f"data: {json.dumps({'type': 'review_card', **pending_review}, ensure_ascii=False)}\n\n"

                        output = event.get("data", {}).get("output", {})
                        messages = (
                            output.get("messages", [])
                            if isinstance(output, dict)
                            else []
                        )

                        from langchain_core.messages import (
                            AIMessage as _AIMsg,
                            ToolMessage as _TMsg,
                        )

                        if not messages:
                            continue
                        last = messages[-1]
                        if isinstance(last, _TMsg):
                            continue
                        if isinstance(last, _AIMsg) and last.tool_calls:
                            continue

                        reply = ""
                        for msg in reversed(messages):
                            if isinstance(msg, _TMsg):
                                continue
                            content = getattr(msg, "content", None)
                            if content:
                                reply = content
                                break
                        if not reply:
                            reply = final_reply
                        if not reply and agent_think_buffer:
                            reply = "".join(agent_think_buffer)
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
                                db_manager.with_db, model_config=model_config
                            )
                            suggestions = await suggestion_tools[
                                "proactive_suggestions"
                            ].ainvoke({"user_id": user_id, "book_id": book_id})
                            if suggestions:
                                yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions}, ensure_ascii=False)}\n\n"
                        except Exception as exc:
                            logger.warning(f"SSE 推送建议失败: {exc}")
                        yield f"data: {json.dumps({'type': 'end', 'reply': reply}, ensure_ascii=False)}\n\n"
                        break
            except openai.APIStatusError as e:
                logger.error(
                    f"stream agent 失败: API [{e.status_code}] "
                    f"request_id={e.response.headers.get('x-request-id', 'N/A')} "
                    f"body={e.body!r}"
                )
                yield f"data: {json.dumps({'type': 'error', 'message': f'模型服务异常 ({e.status_code})'}, ensure_ascii=False)}\n\n"
            except Exception:
                logger.exception("stream agent 失败")
                yield f"data: {json.dumps({'type': 'error', 'message': '服务器内部错误'}, ensure_ascii=False)}\n\n"
            finally:
                await cleanup()

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception:
        await cleanup()
        raise


@router.post("/compress")
async def manual_compress(
    user_id: Annotated[int, Depends(get_current)],
    body: CompressRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
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
        return {"summary": "", "removed_count": 0, "remaining_count": 0}

    state_data = state_snapshot.get("channel_values", {})
    messages = state_data.get("messages", [])

    if not messages:
        return {"summary": "", "removed_count": 0, "remaining_count": 0}

    model_config = state_data.get("model_config", {})
    if not model_config or not model_config.get("main_config"):
        return {
            "summary": "",
            "removed_count": 0,
            "remaining_count": len(messages),
            "error": "未找到模型配置",
        }

    llm = ModelFactory(model_config)
    from langchain_core.messages import HumanMessage, SystemMessage

    parts = []
    for msg in messages:
        role = getattr(msg, "type", type(msg).__name__)
        content = getattr(msg, "content", "") or ""
        parts.append(f"{role}: {content[:400]}")
    combined = "\n".join(parts)

    prompt = (
        f"请详细总结以下对话，保留所有关键决策、用户偏好、创作设定和重要信息。"
        f"这份摘要将替代历史消息成为 Agent 的长期记忆：\n\n{combined[:12000]}"
    )
    try:
        result = await llm.main.ainvoke(
            [
                SystemMessage(content="你是专业的对话摘要助手。"),
                HumanMessage(content=prompt),
            ]
        )
        summary = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.error(f"manual_compress LLM 调用失败: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="摘要生成失败")

    try:
        from domains.memory.repository import AgentMemoryRepository

        memory_repo = AgentMemoryRepository(session)
        await memory_repo.create(
            user_id=user_id,
            data={
                "memory_type": "context_summary",
                "content": summary,
                "source": "manual_compress",
                "metadata": {
                    "thread_id": body.thread_id,
                    "compressed_at": datetime.now(timezone.utc).isoformat(),
                },
            },
        )
    except Exception as exc:
        logger.warning(f"保存压缩摘要到 AgentMemory 失败: {exc}")

    kept_messages = messages[-20:]  # 压缩后保留最近20条消息
    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config=model_config,
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(
        config,
        values={
            "messages": kept_messages,
            "compressed_context": summary,
            "message_count_at_compress": len(messages),
        },
    )

    removed_count = len(messages) - len(kept_messages)
    return {
        "summary": summary,
        "removed_count": removed_count,
        "remaining_count": len(kept_messages),
    }


@router.patch("/state/{thread_id}")
async def patch_state(
    thread_id: str,
    body: dict,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    config = {"configurable": {"thread_id": thread_id}}
    state_snapshot = await checkpoint.aget(config)
    if not state_snapshot:
        raise HTTPException(status_code=404, detail="未找到会话状态")

    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config={},
        checkpointer=checkpoint,
    )
    await graph.aupdate_state(config, values=body)
    return {"status": "ok", "thread_id": thread_id}


@router.post("/review-action")
async def review_action(
    user_id: Annotated[int, Depends(get_current)],
    body: ReviewActionRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
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
    return {"status": "ok", "action": body.action}
