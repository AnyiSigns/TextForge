import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import openai
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from models.book import Book, Chapter, Volume
from models.conversation import Conversation, Message
from schema.request.common import ChatRequest, CompressRequest, ReviewActionRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client

from .agent_state import UserAgentState
from .graphs.agent_graph import build_user_agent_graph

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


async def _generate_title(model_config: dict, user_msg: str, reply: str) -> str | None:
    """根据首条用户消息与 AI 回复，调用主模型生成 5-10 字的会话标题。

    仅用于会话第一条消息结束后自动命名；生成失败或结果异常时返回 None，
    由调用方保留默认标题，不影响主流程。
    """
    try:
        from langchain_core.messages import HumanMessage

        model = ModelFactory(model_config).main
        prompt = (
            "请用一句话（5 到 10 个汉字）概括以下用户与 AI 的第一次对话主题，"
            "只输出标题本身，不要引号、标点或任何解释。\n"
            f"用户：{user_msg[:200]}\n"
            f"AI：{reply[:200]}"
        )
        res = await model.ainvoke([HumanMessage(content=prompt)])
        text = getattr(res, "content", "") or ""
        text = text.strip().strip('"').strip("'").strip()
        text = text.split("\n")[0].strip()
        text = text.replace('"', "").replace("'", "")
        if not text:
            return None
        if len(text) > 10:
            text = text[:10]
        return text
    except Exception as exc:
        logger.warning(f"生成会话标题失败: {exc}")
        return None


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
            custom_queue: asyncio.Queue = asyncio.Queue()
            custom_task = None

            async def _pump_custom():
                try:
                    async for chunk in graph.astream(
                        state, config=config, stream_mode="custom"
                    ):
                        data = chunk[1] if isinstance(chunk, tuple) else chunk
                        if isinstance(data, dict):
                            await custom_queue.put(data)
                except Exception as exc:
                    logger.warning(f"[custom-stream] 捕获工作流流式事件失败: {exc}")
                finally:
                    await custom_queue.put(None)

            try:
                custom_task = asyncio.create_task(_pump_custom())

                yield ":\n\n"
                final_reply = ""
                tool_called_this_turn = False
                agent_think_buffer: list[str] = []
                think_phase = True
                think_started = False
                expect_think_reset = False
                in_compress = False

                def _drain_custom():
                    out = []
                    while not custom_queue.empty():
                        item = custom_queue.get_nowait()
                        if item is None:
                            continue
                        etype = item.get("event")
                        if etype in ("node_start", "node_stream", "node_end", "node_fail"):
                            out.append(
                                f"data: {json.dumps({'type': etype, **item}, ensure_ascii=False)}\n\n"
                            )
                    return out

                async for event in graph.astream_events(
                    state, config=config, version="v2"
                ):
                    for sse in _drain_custom():
                        yield sse
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
                        expect_think_reset = True
                        for sse in _drain_custom():
                            yield sse
                        tool_name = event.get("name", "")
                        output = event.get("data", {}).get("output", {})
                        if tool_name == "generate_chapter" and isinstance(output, dict):
                            progress_events = output.get("progress_events", [])
                            for prog in progress_events:
                                yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                        if tool_name == "generate_outline_extension" and isinstance(output, dict):
                            yield f"data: {json.dumps({'type': 'extend_outline', **output}, ensure_ascii=False)}\n\n"
                        if tool_name == "execute_workflow" and isinstance(output, dict):
                            # node_start/node_stream/node_end 已由自定义事件流实时推送，此处仅处理审核卡
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
                        if tool_name == "execute_workflow_node" and isinstance(output, dict):
                            # node 生命周期事件已由自定义事件流实时推送
                            pass
                        yield f"data: {json.dumps({'type': 'tool_end'}, ensure_ascii=False)}\n\n"
                    elif event_type == "on_chain_start":
                        if event.get("name") == "compress":
                            in_compress = True
                    elif event_type == "on_chat_model_start":
                        # 工具执行完后，主 agent 模型会再次被调用（携带工具结果重新推理）。
                        # 此时复位 think 阶段，使第二次推理也能正确发出 think_start / agent_think_end。
                        # 排除压缩节点(auto_compress_node)内部的子 LLM 调用，避免误触发假思考事件。
                        if expect_think_reset and not in_compress:
                            think_phase = True
                            think_started = False
                            agent_think_buffer.clear()
                            expect_think_reset = False
                    elif event_type == "on_chain_end":
                        if event.get("name") == "compress":
                            in_compress = False
                        for sse in _drain_custom():
                            yield sse
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
                        )
                        from langchain_core.messages import (
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
                        # 首条消息结束后生成会话标题（5-10 字），放在 end 事件之后，
                        # 避免阻塞主回复流结束导致前端长时间显示「生成中」指示器。
                        if not is_resume and conversation.title == "新对话":
                            try:
                                generated = await _generate_title(
                                    model_config, body.message, reply
                                )
                                if generated:
                                    conversation.title = generated
                                    await session.commit()
                                    yield f"data: {json.dumps({'type': 'title_update', 'thread_id': thread_id, 'title': generated}, ensure_ascii=False)}\n\n"
                            except Exception as exc:
                                logger.warning(f"自动生成会话标题失败: {exc}")

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
                if custom_task is not None:
                    custom_task.cancel()
                    try:
                        await custom_task
                    except (asyncio.CancelledError, Exception):
                        pass
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
        async def _empty():
            yield f"data: {json.dumps({'type': 'compress_done', 'summary': '', 'removed_count': 0, 'remaining_count': 0}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    state_data = state_snapshot.get("channel_values", {})
    messages = state_data.get("messages", [])
    if not messages:
        async def _empty():
            yield f"data: {json.dumps({'type': 'compress_done', 'summary': '', 'removed_count': 0, 'remaining_count': 0}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    model_config = state_data.get("model_config", {})
    if not model_config or not model_config.get("main_config"):
        async def _err():
            yield f"data: {json.dumps({'type': 'error', 'message': '未找到模型配置'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

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

    async def event_generator():
        summary = ""
        try:
            async for chunk in llm.main.astream(
                [
                    SystemMessage(content="你是专业的对话摘要助手。"),
                    HumanMessage(content=prompt),
                ]
            ):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if text:
                    summary += text
                    yield f"data: {json.dumps({'type': 'token', 'token': text}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.error(f"manual_compress LLM 调用失败: {exc}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': '摘要生成失败'}, ensure_ascii=False)}\n\n"
            return

        try:
            from domains.memory.repository import AgentMemoryRepository

            memory_repo = AgentMemoryRepository(session)
            await memory_repo.create(
                user_id=user_id,
                data={
                    "book_id": conversation.book_id,
                    "memory_type": "context_summary",
                    "content": summary,
                    "source": "manual_compress",
                    "meta": {
                        "thread_id": body.thread_id,
                        "compressed_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
            )
        except Exception as exc:
            logger.warning(f"保存压缩摘要到 AgentMemory 失败: {exc}")

        kept_messages = messages[-20:]
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
        yield f"data: {json.dumps({'type': 'compress_done', 'summary': summary, 'removed_count': removed_count, 'remaining_count': len(kept_messages)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )

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

    ALLOWED_STATE_KEYS = {'personal_rag_results', 'active_workflow_id', 'workflow_node_outputs'}
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
