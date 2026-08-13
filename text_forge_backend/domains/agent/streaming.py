import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Annotated

from config.logging import get_logger
from config.settings import settings
from core.auth import get_current
from core.errors import classify_agent_error
from core.model_factory import ModelFactory
from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from models.conversation import Message
from schema.request.common import ChatRequest, CompressRequest
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.ratelimit import rate_limit_agent, rate_limit_compress
from sqlalchemy.ext.asyncio import AsyncSession

from .concurrency import (
    _acquire_book_lock,
    _acquire_thread_lock,
    _release_book_lock,
    _release_thread_lock,
    _renew_book_lock,
    _stream_tasks,
)
from .graphs.agent_graph import build_user_agent_graph
from .router import router
from .session import (
    _auto_digest_if_due,
    _generate_title,
    _get_conversation,
    _prepare_agent_state,
    _strip_api_key_from_checkpoint,
)
from .sse_events import (
    _empty_sse,
    _single_sse,
    _sse_compress_done,
    _sse_headers,
    _sse_review_card,
)

logger = get_logger(__name__)


@router.post("/respond")
async def respond_to_agent(
    user_id: Annotated[int, Depends(get_current)],
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """非流式回合（N8：预留/测试用，前端主链路走 /stream；与流式共享并发互斥）。"""
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    # 2.9 P-A 一致性：同一 thread 已有流式/压缩任务时拒绝非流式回合
    if body.thread_id in _stream_tasks:
        raise HTTPException(status_code=409, detail="该会话正在生成中，请等待当前生成完成")
    lock_key = None
    holder_id = None
    book_id = None
    try:
        # 锁在 _prepare_agent_state 内部获取（先加锁后写消息，失败不污染历史）
        conversation, state, book_id, lock_key, holder_id = await _prepare_agent_state(
            session, user_id, body.thread_id, body.message, model_config, body.book_id
        )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": body.thread_id}, "recursion_limit": 100}
        try:
            result = await asyncio.wait_for(
                graph.ainvoke(state, config=config), timeout=settings.LLM_TIMEOUT
            )
        except asyncio.TimeoutError:
            logger.error("agent respond 空闲超时")
            raise HTTPException(status_code=504, detail="生成超时，请稍后重试")
        except Exception as exc:
            app_exc = classify_agent_error(exc)
            logger.error(f"agent respond 失败 (code={app_exc.error_code}): {exc}", exc_info=True)
            raise app_exc
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
        if ai_message:
            # 与流式路径一致（见 stream_agent 的回合落库）：非流式回复也必须
            # 持久化，否则该回合 AI 回复从历史会话中永久丢失。
            ai_msg = Message(
                conversation_id=conversation.id,
                role="assistant",
                content=ai_message,
            )
            session.add(ai_msg)
            await session.commit()
        return {"reply": ai_message, "thread_id": body.thread_id}
    finally:
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key, holder_id)
        # 2.10 P-B：回合后剥离 checkpoint api_key（graph/config 可能未绑定，判空守卫）
        await _strip_api_key_from_checkpoint(
            locals().get("graph"), locals().get("config")
        )


@router.post("/stream/{thread_id}")
async def stream_agent(
    user_id: Annotated[int, Depends(get_current)],
    thread_id: str,
    body: ChatRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
    _rl: None = Depends(rate_limit_agent),
):
    model_config = body.model_config_data or {}
    if not model_config or not model_config.get("main_config"):
        raise HTTPException(status_code=400, detail="用户模型配置未设置")
    # 2.9 P-A：同 thread 并发互斥——本地注册表先查后占位，Redis SET NX 兜底跨进程。
    # 占位后所有出口（早退 return / 外层 except / event_generator finally）都必须 pop。
    if thread_id in _stream_tasks:
        raise HTTPException(status_code=409, detail="该会话正在生成中，请等待当前生成完成")
    _thread_lock_key = ""
    _thread_holder_id = ""
    lock_key = None
    holder_id = None
    locked = False
    book_id = None
    _heartbeat_task: asyncio.Task | None = None
    _thread_heartbeat_task: asyncio.Task | None = None

    async def cleanup():
        # 幂等：锁已被提前释放（end 事件后）时，Lua 持有者校验会拒绝重复删除；
        # 心跳任务对已完成/已取消任务重复 cancel 无副作用。
        if _heartbeat_task is not None:
            _heartbeat_task.cancel()
        if _thread_heartbeat_task is not None:
            _thread_heartbeat_task.cancel()
        if book_id:
            await _release_book_lock(book_id, user_id, lock_key, holder_id)
        await _release_thread_lock(_thread_lock_key, _thread_holder_id)

    try:
        # 注册占位 + Redis 线程锁放入 try 内：acquire 期间的取消/异常由 except 统一清理，
        # 避免占位残留导致该 thread 永久 409（v5 泄漏修复的封闭边界）
        _stream_tasks[thread_id] = None
        _thread_locked, _thread_lock_key, _thread_holder_id = await _acquire_thread_lock(
            thread_id
        )
        if not _thread_locked:
            _stream_tasks.pop(thread_id, None)
            raise HTTPException(status_code=409, detail="该会话正在生成中，请等待当前生成完成")
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

            state_data = dict(state_snapshot.get("channel_values", {}))
            # turn_metrics/subgraph_steps 是求和 reducer 通道，
            # resume 输入会把 checkpoint 旧值再次喂给 reducer 求和导致计数翻倍
            # （并可能使 quality_gate_router 读到虚高的 subgraph_steps 提前 END）。
            # 从输入中剔除这两个键：LangGraph 保留 checkpoint 原值，新节点执行继续累加。
            state_data.pop("turn_metrics", None)
            state_data.pop("subgraph_steps", None)
            # 嵌套子图版：subgraph_report 是 LastValue 回流通道，sync 节点已清空；
            # 剔除 checkpoint 旧值（若有残留），防子图失败路径读到陈旧 report 二次合并。
            state_data.pop("subgraph_report", None)
            # checkpoint 持久化的 model_config 可能携带 api_key
            # 且可能已过时（用户改了配置）。resume 回合必须用请求体携带的最新配置覆盖，
            # 避免陈旧/泄露的密钥被读取复用，也保证用户改配后立即生效。
            state_data["model_config"] = model_config
            # resume 回合（无新用户消息）不重新做意图分类，
            # supervisor_node 见 resume_from_subgraph 直接沿用原子图；新消息回合在
            # _prepare_agent_state 置 None 复位。
            _resume_subgraph = state_data.get("subgraph")
            pending_tool = state_data.get("pending_tool")
            if pending_tool:
                # 被门控拦截的写工具审批：直接交回 tool_calls 节点执行，不重跑 agent
                # 防御性校验：review_decision 仅 accept/edit/retry/terminate 合法；
                # 非法值（如绕过 review_action 直接 update_state 注入）按 terminate 处理
                # （拒绝执行），避免写工具被意外执行。
                _tool_decision = state_data.get("review_decision") or ""
                if _tool_decision not in ("accept", "edit", "retry", "terminate"):
                    logger.warning(
                        f"[resume] 非法 review_decision={_tool_decision!r}，按 terminate 拒绝执行"
                    )
                    _tool_decision = "terminate"
                state = {
                    **state_data,
                    "resume_from_subgraph": _resume_subgraph,
                    "pending_tool": {
                        **pending_tool,
                        "decision": _tool_decision,
                        "edited_content": state_data.get("edited_content"),
                    },
                    "pending_review": None,
                    "review_decision": None,
                    "edited_content": None,
                    "candidate_reply_ready": False,
                }
            else:
                pending_review = state_data.get("pending_review")
                if not pending_review:
                    # v5 泄漏修复：该早退路径不抛异常也不走 event_generator finally，
                    # 必须在此显式清除占位并释放线程锁，否则该 thread 永久 409。
                    _stream_tasks.pop(thread_id, None)
                    await _release_thread_lock(_thread_lock_key, _thread_holder_id)
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
                        instruction_parts.append(
                            f"target_chapter_id={chapter_id_for_terminate}"
                        )
                    node_outputs = state_data.get("workflow_node_outputs", {})
                    if node_outputs:
                        outputs_text = "\n\n".join(
                            [
                                f"[{nid}] {data if isinstance(data, str) else data.get('output', '')[:2000]}"
                                for nid, data in node_outputs.items()
                            ]
                        )
                        instruction_parts.append(
                            f"根据以下工作流节点输出生成章节正文：\n\n{outputs_text}"
                        )
                    messages.append(
                        HumanMessage(
                            content=f"工作流已被用户终止。请根据已完成的节点输出生成最终章节。{' '.join(instruction_parts) if instruction_parts else '请汇总已有输出并给出建议。'}"
                        )
                    )
                    state = {
                        **state_data,
                        "messages": messages,
                        "resume_from_subgraph": _resume_subgraph,
                        "pending_review": None,
                        "review_decision": None,
                        "edited_content": None,
                        "terminate_chapter_id": None,
                        "active_workflow_id": None,
                        # merge_dicts 对 {} 是 no-op（旧值滞留，
                        # write_workflow_candidate 仍可读到过期候选），必须传 None 经
                        # merge_dicts_or_clear 真正清空 workflow_node_outputs。
                        "workflow_node_outputs": None,
                        # 关键：工作流审计拦截时 _finish_with_candidate 会把
                        # candidate_reply_ready 置 True（_entry_router 见之立即 END），
                        # 续跑必须重置为 False，否则用户审核决定永远不会被 agent 处理；
                        # workflow_result 同样必须清空，否则 gated_tool_node 的
                        # 「候选确认回合」守卫会拦截 retry/continue 所需的工具调用。
                        "candidate_reply_ready": False,
                        "workflow_result": None,
                    }
                else:
                    wf_id = pending_review.get("workflow_id")
                    nid = pending_review.get("node_id")
                    tcid = pending_review.get("target_chapter_id")
                    if wf_id and nid:
                        # 确定性续跑：按待审节点的精确 workflow_id + node_id 重跑，
                        # 不再让 LLM 臆测节点 ID（此前误把审计角色 auditor 当节点导致「节点不存在」）。
                        queued: dict = {"workflow_id": wf_id, "node_id": nid}
                        if tcid is not None:
                            queued["target_chapter_id"] = tcid
                        # 重跑必须携带祖先节点输出：run_workflow 返回的 upstream_outputs
                        # 是到失败节点为止的全部已执行节点输出（不含失败节点自身），
                        # 若不透传，汇聚类节点（如总编仲裁官）重跑时丢失上游上下文。
                        # workflow_result 随即在下文被清空，故须在此先取出。
                        _upstream = (state_data.get("workflow_result") or {}).get(
                            "upstream_outputs"
                        )
                        if _upstream:
                            queued["upstream_outputs"] = _upstream
                        if review_decision == "accept":
                            # 用户接受当前输出：重跑该节点但跳过自动质量审计，直接作为候选呈现
                            queued["skip_audit"] = True
                            note = f"节点 [{node_label}] 的输出已被用户接受，正在重新执行并继续。"
                        elif review_decision == "edit" and edited_content:
                            # 用户修改后内容：直接作为节点输出，跳过生成与审计
                            queued["forced_output"] = edited_content
                            note = f"节点 [{node_label}] 的输出已被用户修改，正在按修改后内容继续。"
                        else:  # retry：重跑同一节点并重新审计
                            note = f"节点 [{node_label}] 的输出被用户拒绝，正在重新生成。"
                        messages.append(HumanMessage(content=note))
                        state = {
                            **state_data,
                            "messages": messages,
                            "resume_from_subgraph": _resume_subgraph,
                            "pending_review": None,
                            "review_decision": None,
                            "edited_content": None,
                            # 续跑必须清 candidate_reply_ready 与 workflow_result，
                            # 否则图在 _entry_router 立即 END、审核决定失效。
                            "candidate_reply_ready": False,
                            "workflow_result": None,
                            "pending_workflow": queued,
                        }
                    else:
                        # 兜底：缺少 workflow_id/node_id 时退回自然语言续跑（旧行为）
                        if review_decision == "retry":
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
                            "resume_from_subgraph": _resume_subgraph,
                            "pending_review": None,
                            "review_decision": None,
                            "edited_content": None,
                            # 同 terminate 分支：审计拦截续跑必须清 candidate_reply_ready 与
                            # workflow_result，否则图在 _entry_router 立即 END、审核决定失效。
                            "candidate_reply_ready": False,
                            "workflow_result": None,
                        }
        else:
            # 锁在 _prepare_agent_state 内部获取（先加锁后写消息，失败不污染历史）
            conversation, state, book_id, lock_key, holder_id = (
                await _prepare_agent_state(
                    session,
                    user_id,
                    thread_id,
                    body.message,
                    model_config,
                    body.book_id,
                )
            )
        # 个人库检索结果随回合下发（请求体优先）。
        # 不能靠 PATCH checkpoint——_prepare_agent_state 对 personal_rag_results
        # 显式置 None，last-value 语义会覆盖 PATCH 值；此处直接覆盖回合输入。
        # PersonalRagHit 模型 → dict（workflow_scheduler 用 item.get(...) 读取）。
        if body.personal_rag_results is not None:
            state["personal_rag_results"] = [
                r.model_dump() for r in body.personal_rag_results
            ]
        if book_id and not lock_key:
            # resume 分支未经 _prepare_agent_state，需自行获取书籍锁
            locked, lock_key, holder_id = await _acquire_book_lock(book_id, user_id)
            if not locked:
                raise HTTPException(
                    status_code=503, detail="该书籍正在进行 Agent 任务，请稍后再试"
                )
        if lock_key:
            # 长任务（工作流多节点可达数十分钟）期间周期续期锁 TTL，防止执行中锁过期被他人获取
            _heartbeat_task = asyncio.create_task(_renew_book_lock(lock_key, holder_id))
        if _thread_lock_key:
            # 线程互斥锁同样心跳续期（2.9 P-A），防止长流式期间线程锁过期
            _thread_heartbeat_task = asyncio.create_task(
                _renew_book_lock(_thread_lock_key, _thread_holder_id)
            )
        graph = build_user_agent_graph(
            db_manager.with_db,
            model_config=model_config,
            checkpointer=graph_pool_manager.checkpoint,
        )
        config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 100}

        async def event_generator():
            """stream_agent 的 SSE 事件生成器（阶段总览）。

            流程阶段：
            1. 首行 keepalive `:` → 图 astream(updates+custom, subgraphs=True)；
            2. custom 事件分流：agent_token/agent_think_start/agent_think_end → 透传前端；
            3. updates 分流：子图/节点 update → progress/tool_start/tool_end/review_card
               事件映射（含工具调用进度与审核卡推送）；
            4. 终态处理：提取最终 AI 回复（跳过 tool_calls 消息）、落库消息与审核卡、
               建议去重推送、标题生成、auto_digest 摘要；
            5. 收尾：turn_metrics SSE + 落库、释放书籍锁、生成 end 事件。

            异常路径统一经 classify_agent_error 转译为具体错误事件，不中断流。
            """
            _ag_iter = None
            # 指标层：回合开始时间（time.monotonic 单调时钟，不受系统时间调整影响）
            _turn_started = time.monotonic()
            # 回合指标 payload：先构造并下发 SSE 事件，落库在 end/锁释放后进行
            _metrics_payload: dict | None = None
            try:
                yield ":\n\n"
                final_reply = ""
                # 收集本回合推送的审核卡，回合结束统一落库为卡片消息，
                # 使历史会话能还原审核卡（Message 表新增 type/token 列）
                _card_payloads: list[dict] = []
                # 单迭代器：stream_mode=["updates","custom"]，二者按真实执行顺序交错产出，
                # 消除此前「astream(custom) 独立任务 + astream_events 主循环」双通道的
                # 事件竞态与 node_start/node_end 重复推送问题。
                from langchain_core.messages import AIMessage as _AIMsg
                from langchain_core.messages import HumanMessage as _HMsg
                from langchain_core.messages import ToolMessage as _TMsg

                _ag_iter = graph.astream(
                    state,
                    config=config,
                    stream_mode=["updates", "custom"],
                    # 嵌套子图版（重建）：必须开 subgraphs=True，子图内
                    # get_stream_writer() 才会继承父流（否则 agent_token 等 custom
                    # 事件在子图内丢失）；事件随之变 (ns, mode, data) 三元组，
                    # 顶层 ns=()、子图内部 ns=("子图名:hash",)。
                    subgraphs=True,
                ).__aiter__()
                _idle_timeout = settings.LLM_TIMEOUT
                # 周期心跳：长步骤内子图/工具可能数分钟无 token 输出，前端 60s
                # watchdog 会误杀连接。实现：__anext__ 任务常驻推进（绝不能取消，
                # 取消会关闭 async generator 导致流提前终止），另起 20s 心跳探针
                # 与之 race——探针先到则下发 SSE 注释行 `:\n\n`（前端 readSSE 跳过
                # 注释行但数据读取已发生，watchdog 被重置）并重建探针；
                # 单步总空闲仍受 LLM_TIMEOUT 约束。
                _heartbeat_interval = 20
                _step_start = time.monotonic()
                _anext_task: asyncio.Task = asyncio.create_task(_ag_iter.__anext__())
                _heartbeat_task: asyncio.Task = asyncio.create_task(
                    asyncio.sleep(_heartbeat_interval)
                )
                while True:
                    _done, _ = await asyncio.wait(
                        {_anext_task, _heartbeat_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if _anext_task in _done:
                        # 迭代器推进完成：取消心跳探针并重置；取得步骤（StopAsyncIteration
                        # 表示图正常结束）。不取消 __anext__ 任务本身。
                        if not _heartbeat_task.done():
                            _heartbeat_task.cancel()
                        _heartbeat_task = asyncio.create_task(
                            asyncio.sleep(_heartbeat_interval)
                        )
                        try:
                            _step = _anext_task.result()
                        except StopAsyncIteration:
                            break
                        ns, mode, data = _step
                        # 收到真实步骤/事件：重置单步空闲计时，并常驻推进下一轮
                        _step_start = time.monotonic()
                        _anext_task = asyncio.create_task(_ag_iter.__anext__())
                    else:
                        # 心跳探针先到：单步总空闲超过 LLM_TIMEOUT 才判定真正超时
                        # （长步骤允许）；未超时则下发心跳并重建探针。
                        _now = time.monotonic()
                        if _now - _step_start >= _idle_timeout:
                            logger.error("Agent 流式空闲超时，主动终止回合")
                            yield f"data: {json.dumps({'type': 'error', 'message': '生成超时，请稍后重试'}, ensure_ascii=False)}\n\n"
                            break
                        yield ":\n\n"
                        _heartbeat_task = asyncio.create_task(
                            asyncio.sleep(_heartbeat_interval)
                        )
                        continue
                    # 客户端断连：尽快终止并释放书籍锁，避免空占锁到 TTL
                    if await request.is_disconnected():
                        logger.info("客户端已断开，终止 Agent 流式")
                        break
                    if mode == "custom":
                        if not isinstance(data, dict):
                            continue
                        etype = data.get("event")
                        if etype in (
                            "node_start",
                            "node_stream",
                            "node_end",
                            "node_fail",
                            "subgraph_start",
                        ):
                            yield f"data: {json.dumps({'type': etype, **data}, ensure_ascii=False)}\n\n"
                        elif etype == "think_start":
                            # 3.10 清理：不再下发恒 0 的 elapsed 字段（前端未使用）
                            yield f"data: {json.dumps({'type': 'think_start', 'user_id': user_id}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_think_end":
                            yield f"data: {json.dumps({'type': 'agent_think_end'}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_reasoning":
                            # 思考内容：前端仅用于状态指示，不强依赖其文本
                            yield f"data: {json.dumps({'type': 'agent_reasoning', 'token': data.get('token', '')}, ensure_ascii=False)}\n\n"
                        elif etype == "agent_token":
                            token = data.get("token", "")
                            if token:
                                final_reply += token
                                yield f"data: {json.dumps({'type': 'agent_token', 'token': token}, ensure_ascii=False)}\n\n"
                        continue

                    # ── updates 模式：每完成一个节点产出 {节点名: state 增量} ──
                    if not isinstance(data, dict):
                        continue
                    for node_name, update in data.items():
                        if not isinstance(update, dict):
                            continue
                        # 嵌套子图版：子图节点的顶层 update = 子图输出全量（messages
                        # 累计 + report 等），其内容已由 ns!=() 的子图内部 updates
                        # 逐节点处理过（agent 步进/tool 执行/审核卡），跳过避免
                        # tool_start/progress/审核卡等事件重复推送。
                        if not ns and node_name in (
                            "worldbuilding",
                            "outlining",
                            "drafting",
                            "revising",
                        ):
                            continue
                        # agent/子图节点返回 messages 增量：若含 tool_calls 则模型决定调工具
                        if node_name in ("agent", "worldbuilding", "outlining", "drafting", "revising"):
                            msgs = update.get("messages") or []
                            if msgs:
                                last = msgs[-1]
                                if isinstance(last, _AIMsg) and getattr(
                                    last, "tool_calls", None
                                ):
                                    # 按本轮 generate_chapter 调用次数给出真实 N/M 进度
                                    # （单章生成的真实进度仍由 progress_events 透传）
                                    _gcs = [
                                        t for t in last.tool_calls
                                        if (t.get("name") if isinstance(t, dict) else getattr(t, "name", "")) == "generate_chapter"
                                    ]
                                    _gc_total = max(len(_gcs), 1)
                                    _gc_n = 0
                                    for _gi, _tc in enumerate(last.tool_calls):
                                        tname = (
                                            _tc.get("name")
                                            if isinstance(_tc, dict)
                                            else getattr(_tc, "name", "")
                                        )
                                        if tname == "generate_chapter":
                                            _gc_n += 1
                                            yield f"data: {json.dumps({'type': 'progress', 'step': 'generate_chapter', 'n': _gc_n, 'total': _gc_total, 'words': 0, 'eta': 0}, ensure_ascii=False)}\n\n"
                                        elif tname == "generate_outline_extension":
                                            yield f"data: {json.dumps({'type': 'extend_outline', 'step': 'extend_outline', 'n': 0, 'total': 1}, ensure_ascii=False)}\n\n"
                                        elif tname == "build_outline":
                                            # build_outline 批量建卷的 N/M 进度（按卷粒度）
                                            _bo_args = (
                                                _tc.get("args")
                                                if isinstance(_tc, dict)
                                                else getattr(_tc, "args", None)
                                            )
                                            _bo_vols = (
                                                _bo_args.get("volumes")
                                                if isinstance(_bo_args, dict)
                                                and isinstance(_bo_args.get("volumes"), list)
                                                else []
                                            )
                                            _bo_total = max(len(_bo_vols), 1)
                                            for _vi, _v in enumerate(_bo_vols, 1):
                                                _v_title = ""
                                                if isinstance(_v, dict):
                                                    _v_title = str(_v.get("title") or "")[:50]
                                                yield f"data: {json.dumps({'type': 'progress', 'step': 'build_outline', 'n': _vi, 'total': _bo_total, 'words': 0, 'eta': 0, 'label': _v_title}, ensure_ascii=False)}\n\n"
                                        # tool_start 携带 tool_call_id，供前端按 id 配对工具卡片
                                        # （同轮同名工具连续调用不再错位更新）
                                        _tc_id = (
                                            _tc.get("id") if isinstance(_tc, dict) else getattr(_tc, "id", "")
                                        )
                                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tname, 'tool_call_id': _tc_id or ''}, ensure_ascii=False)}\n\n"
                        # tool_calls 节点完成：工具执行结束，取 ToolMessage 输出推导业务事件
                        elif node_name == "tool_calls":
                            # 写工具被门控拦截时（gated_tool_node 返回 pending_review），
                            # 必须推送审核卡，否则前端永远收不到 review_card、审批流卡死。
                            if update.get("pending_review"):
                                _card_payloads.append(update["pending_review"])
                                yield _sse_review_card(update["pending_review"])
                            msgs = update.get("messages") or []
                            for m in msgs:
                                if not isinstance(m, _TMsg):
                                    continue
                                _out = m.content
                                if isinstance(_out, dict):
                                    _out = json.dumps(_out, ensure_ascii=False)
                                _parsed = None
                                if isinstance(_out, str) and _out.startswith("{"):
                                    try:
                                        _parsed = json.loads(_out)
                                    except Exception:
                                        _parsed = None
                                    if isinstance(_parsed, dict) and _parsed.get(
                                        "status"
                                    ) == "completed" and _parsed.get("progress_events"):
                                        for prog in _parsed["progress_events"]:
                                            yield f"data: {json.dumps({'type': 'progress', **prog}, ensure_ascii=False)}\n\n"
                                # tool_end 携带 tool_call_id（与 tool_start 配对）
                                # 与 success 失败语义——工具返回 error 时 UI 不再一律显示成功 ✓。
                                _tc_id = getattr(m, "tool_call_id", "") or ""
                                # 复用 agent_nodes._is_tool_error 统一
                                # 失败判词，避免两处字符串启发式漂移。
                                from .agent_nodes import _is_tool_error

                                _is_err = _is_tool_error(m)
                                yield f"data: {json.dumps({'type': 'tool_end', 'tool': m.name, 'tool_call_id': _tc_id, 'success': not _is_err}, ensure_ascii=False)}\n\n"
                        # workflow_runner 节点：工作流审计若产生 pending_review，推送审核卡
                        elif node_name == "workflow_runner":
                            if update.get("pending_review"):
                                _card_payloads.append(update["pending_review"])
                                yield _sse_review_card(update["pending_review"])

                # ── 图执行结束：从 checkpointer 读取最终 state，提取最终回复 ──
                reply = ""
                try:
                    snap = await graph.aget_state(config)
                    final_state = snap.values if snap else {}
                    final_messages = final_state.get("messages", [])
                    logger.info(
                        f"[stream_agent] 图结束: candidate_reply_ready={final_state.get('candidate_reply_ready')} "
                        f"messages_len={len(final_messages)} 最后消息类型={type(final_messages[-1]).__name__ if final_messages else 'none'}"
                    )
                    if final_messages:
                        last = final_messages[-1]
                        if isinstance(last, _TMsg) or (
                            isinstance(last, _AIMsg)
                            and getattr(last, "tool_calls", None)
                        ):
                            last = None
                            for m in reversed(final_messages):
                                if isinstance(m, _TMsg):
                                    continue
                                if isinstance(m, _AIMsg) and getattr(
                                    m, "tool_calls", None
                                ):
                                    continue
                                # 只回退到 AI 消息；跳过用户消息，避免「AI 把用户问题原样复读」
                                if isinstance(m, _HMsg):
                                    continue
                                content = getattr(m, "content", None)
                                if content:
                                    last = m
                                    break
                        if last is not None:
                            content = getattr(last, "content", None) or ""
                            reply = (
                                content if isinstance(content, str) else str(content)
                            )
                except Exception as exc:
                    logger.warning(f"读取最终回复失败: {exc}")
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
                # 审核卡落库为卡片消息（历史会话可还原）
                if _card_payloads:
                    try:
                        for _card in _card_payloads:
                            session.add(
                                Message(
                                    conversation_id=conversation.id,
                                    role="assistant",
                                    content="",
                                    type="review-card",
                                    token=json.dumps(_card, ensure_ascii=False),
                                )
                            )
                        await session.commit()
                    except Exception as exc:
                        logger.warning(f"审核卡消息落库失败: {exc}")
                try:
                    from .tools.feedback_tools import _build_feedback_tools

                    suggestion_tools = _build_feedback_tools(
                        db_manager.with_db, model_config=model_config
                    )
                    suggestions = await suggestion_tools[
                        "proactive_suggestions"
                    ].ainvoke({"user_id": user_id, "book_id": book_id})
                    # 建议去重：同一建议组合只在会话内推送一次（按 items 的签名比较），
                    # 避免每次回复都重复推送同样的「情节线停滞/章节缺摘要」建议刷屏。
                    _sig = (
                        json.dumps(suggestions, ensure_ascii=False, sort_keys=True)
                        if suggestions
                        else ""
                    )
                    _prev_sig = (final_state or {}).get("suggestions_signature") or ""
                    if suggestions and _sig != _prev_sig:
                        yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions}, ensure_ascii=False)}\n\n"
                        try:
                            await graph.aupdate_state(
                                config, values={"suggestions_signature": _sig}
                            )
                        except Exception:
                            pass
                except Exception as exc:
                    logger.warning(f"SSE 推送建议失败: {exc}")
                # 指标层：回合指标 SSE 事件（必须在 end 之前推送，
                # 前端可读取完整指标；end 事件后流尚未关闭）。落库移到 end 之后，
                # 避免新开池连接 + commit 阻塞用户可见的流结束（同标题/摘要的处理顺序）。
                try:
                    from .metrics import (
                        build_turn_metrics_payload,
                        sse_turn_metrics_line,
                    )

                    _metrics_payload = build_turn_metrics_payload(
                        final_state or {}, _turn_started
                    )
                    _metrics_payload["thread_id"] = thread_id
                    yield sse_turn_metrics_line(_metrics_payload)
                except Exception as exc:
                    logger.warning(f"[metrics] 回合指标事件下发失败: {exc}")
                # 先推送 end，让前端立即结束流式（三点脉冲消失、streaming 定型）。
                # 标题生成涉及一次模型调用（可能耗时数秒），放在 end 之后执行，
                # 避免阻塞主回复流结束导致前端长时间显示「正在生成」指示器。
                yield f"data: {json.dumps({'type': 'end', 'reply': reply}, ensure_ascii=False)}\n\n"
                # 提前释放书籍锁：前端收到 end 即恢复可发送状态，若锁拖到标题生成
                # （一次完整 LLM 调用，耗时数秒）结束后才释放，用户在该窗口内的
                # 新消息会被 503 拒绝。此处释放后 finally 中的 cleanup 幂等（Lua
                # 持有者校验 + 心跳任务 cancel 无副作用），重复调用安全。
                await cleanup()
                # 回合结束自动摘要存库（节流：新增消息 ≥ AUTO_DIGEST_INTERVAL 才生成）。
                # 放在锁释放之后，digest 的完整 LLM 调用不阻塞用户新消息发送；失败静默。
                if not is_resume:
                    try:
                        await _auto_digest_if_due(
                            final_state,
                            conversation,
                            user_id,
                            thread_id,
                            graph,
                            config,
                        )
                    except Exception as exc:
                        logger.warning(f"auto_digest 调用失败: {exc}")
                # 首条消息结束后生成会话标题（5-10 字）并直接写入数据库，
                # 随后以 title_update 事件下发（此时流尚未关闭，前端仍会读取）。
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
                # 指标层：回合指标落库 + 结构化日志。放在 end/锁释放之后，
                # 与 auto_digest/标题同一批非阻塞收尾，避免新开池连接阻塞用户可见流结束。
                if _metrics_payload:
                    try:
                        from .metrics import persist_turn_metrics

                        await persist_turn_metrics(
                            db_manager.with_db, user_id, book_id, _metrics_payload
                        )
                        logger.info(
                            f"[metrics] turn={thread_id} subgraph={_metrics_payload.get('subgraph')} "
                            f"duration_ms={_metrics_payload.get('duration_ms')} "
                            f"llm_calls={_metrics_payload.get('llm_calls')} "
                            f"tool_calls={_metrics_payload.get('tool_calls')} "
                            f"success={_metrics_payload.get('tool_success')} "
                            f"fail={_metrics_payload.get('tool_fail')} "
                            f"compress={_metrics_payload.get('compress_count')} "
                            f"approvals={_metrics_payload.get('approval_count')} "
                            f"accept={_metrics_payload.get('approval_accept')}"
                        )
                    except Exception as exc:
                        logger.warning(f"[metrics] 回合指标落库失败: {exc}")

            except Exception as e:
                app_exc = classify_agent_error(e)
                logger.error(f"stream agent 失败 (code={app_exc.error_code}): {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': app_exc.detail}, ensure_ascii=False)}\n\n"
            finally:
                # 关闭底层图迭代器，避免空闲超时/断连 break 后生成器残留
                if _ag_iter is not None:
                    try:
                        await _ag_iter.aclose()
                    except Exception:
                        pass
                _stream_tasks.pop(thread_id, None)
                # 2.10 P-B：回合后剥离 checkpoint api_key（best-effort，在释放锁之前完成，
                # 与 _auto_digest 的 aupdate_state 不冲突——该调用已在上方 try 内执行完）。
                # 审查修复：线程锁交由 cleanup() 统一释放（cleanup 先 cancel 心跳再删锁，
                # 避免显式释放后心跳唤醒重建锁键导致 Redis 409 残留）。
                await _strip_api_key_from_checkpoint(graph, config)
                await cleanup()

        _current_task = asyncio.current_task()
        if _current_task is not None:
            _stream_tasks[thread_id] = _current_task
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
        # 端点级异常出口：占位与线程锁必须清理（v5：除 generator finally 外的第二出口；
        # 线程锁释放由 cleanup 统一处理——先 cancel 心跳再删锁，避免心跳重建锁键）
        _stream_tasks.pop(thread_id, None)
        await cleanup()
        raise


@router.post("/stream/{thread_id}/cancel")
async def cancel_stream(
    thread_id: str,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    """主动取消当前进程内正在执行的 Agent 流式任务。

    取消请求处理 task 会使 event_generator 在挂起点收到 CancelledError，
    finally 清理随即执行（释放书籍锁、移除任务注册）。用于前端「停止」按钮
    的兜底：即使浏览器连接断开未被服务端及时感知，也能尽快终止任务。

    Args:
        thread_id: 会话 ID。
        user_id: 当前用户 ID（依赖注入）。
        session: 数据库会话（依赖注入）。

    Returns:
        是否找到并取消了任务。
    """
    conversation = await _get_conversation(session, thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    task = _stream_tasks.get(thread_id)
    if task and not task.done():
        task.cancel()
        # 清理 checkpoint 中的 pending 三件套：abort 后若用户 resume（无消息续跑），
        # 不会继续执行被拦截的写工具（计划）。新消息路径已由
        # _prepare_agent_state 一次性重置，二者不冲突。
        try:
            checkpoint = graph_pool_manager.checkpoint
            if checkpoint:
                _config = {"configurable": {"thread_id": thread_id}}
                await checkpoint.aupdate_state(
                    _config,
                    values={
                        "pending_tool": None,
                        "pending_review": None,
                        "pending_workflow": None,
                    },
                )
        except Exception as exc:
            logger.warning(f"[cancel_stream] 清理 pending 状态失败: {exc}")
        return {"ok": True}
    return {"ok": False}


@router.post("/compress")
async def manual_compress(
    user_id: Annotated[int, Depends(get_current)],
    body: CompressRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
    _rl: None = Depends(rate_limit_compress),
):
    conversation = await _get_conversation(session, body.thread_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    checkpoint = graph_pool_manager.checkpoint
    if not checkpoint:
        raise HTTPException(status_code=503, detail="Checkpointer 未就绪")

    # 2.9 P-A：压缩与流式互斥（校验类 404/503 在前，注册占位后所有出口必须清理）。
    # 审查修复：注册占位 + Redis 锁放入 try 内——acquire 期间的取消/异常由 except 统一清理，
    # 与 stream_agent 一致，避免占位残留导致该 thread 永久 409。
    if body.thread_id in _stream_tasks:
        raise HTTPException(status_code=409, detail="该会话正在生成中，请等待当前生成完成")

    def _pop_compress_task() -> None:
        # v5：占位注册后的所有出口共用清理，防早退泄漏导致 thread 永久 409
        _stream_tasks.pop(body.thread_id, None)

    try:
        _stream_tasks[body.thread_id] = None
        _t_locked, _t_key, _t_holder = await _acquire_thread_lock(body.thread_id)
        if not _t_locked:
            _stream_tasks.pop(body.thread_id, None)
            raise HTTPException(status_code=409, detail="该会话正在生成中，请等待当前生成完成")
        config = {"configurable": {"thread_id": body.thread_id}}
        state_snapshot = await checkpoint.aget(config)
        if not state_snapshot:
            _pop_compress_task()
            await _release_thread_lock(_t_key, _t_holder)
            # SSE 样板统一走 _sse_headers/_sse_compress_done
            return StreamingResponse(
                _single_sse(_sse_compress_done("", 0, 0)),
                media_type="text/event-stream",
                headers=_sse_headers(),
            )

        state_data = state_snapshot.get("channel_values", {})
        messages = state_data.get("messages", [])
        if not messages:
            _pop_compress_task()
            await _release_thread_lock(_t_key, _t_holder)
            return StreamingResponse(
                _single_sse(_sse_compress_done("", 0, 0)),
                media_type="text/event-stream",
                headers=_sse_headers(),
            )

        # 2.6：请求体配置优先（前端 streamCompress 已携带 modelConfig），缺省回退 checkpoint
        # （2.10 剥离 api_key 后 checkpoint 配置不可用，必须靠请求体注入）。
        model_config = body.model_config_data or state_data.get("model_config", {})
        if not model_config or not model_config.get("main_config"):
            _pop_compress_task()
            await _release_thread_lock(_t_key, _t_holder)
            return StreamingResponse(
                _single_sse(f"data: {json.dumps({'type': 'error', 'message': '未找到模型配置'}, ensure_ascii=False)}\n\n"),
                media_type="text/event-stream",
                headers=_sse_headers(),
            )

        # 档位模型容错：tool 档位配置异常时剔除后重建，保证 main 档可用（压缩不中断）
        try:
            llm = ModelFactory(model_config)
        except Exception as exc:
            logger.warning(f"manual_compress ModelFactory 初始化失败，剔除 tool_config 后重建: {exc}")
            _cfg = dict(model_config or {})
            _cfg.pop("tool_config", None)
            llm = ModelFactory(_cfg)
        from langchain_core.messages import HumanMessage, SystemMessage

        from .context_manager import flatten_messages_for_summary, safe_compress_cutoff

        # 复用共享展平实现
        combined = flatten_messages_for_summary(messages, 400)

        prompt = (
            f"请详细总结以下对话，保留所有关键决策、用户偏好、创作设定和重要信息。"
            f"这份摘要将替代历史消息成为 Agent 的长期记忆：\n\n{combined[:12000]}"
        )

        async def event_generator():
            # 外层 try/finally：生成器结束（正常/异常/客户端断连 aclose）统一释放占位与线程锁，
            # 防止压缩早退或中断后该 thread 永久 409（v5 泄漏修复）。
            try:
                summary = ""
                try:
                    # N4：逐 chunk 120s 超时（复用 workflow_scheduler.py:740 的
                    # wait_for(anext(stream)) 模式），防止 MaaS 挂起导致压缩永久卡住。
                    # 压缩类功能统一走 tool 档位（结构化/摘要专用），未配置时回落 main 兜底。
                    compress_llm = getattr(llm, "tool", None) or llm.main
                    stream = compress_llm.astream(
                        [
                            SystemMessage(content="你是专业的对话摘要助手。"),
                            HumanMessage(content=prompt),
                        ]
                    )
                    while True:
                        try:
                            chunk = await asyncio.wait_for(anext(stream), timeout=120)
                        except StopAsyncIteration:
                            break
                        except asyncio.TimeoutError:
                            yield f"data: {json.dumps({'type': 'error', 'message': '摘要生成超时，请稍后重试'}, ensure_ascii=False)}\n\n"
                            return
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
                    memory_payload = {
                        "book_id": conversation.book_id,
                        "memory_type": "context_summary",
                        "content": summary,
                        "source": "manual_compress",
                        "meta": {
                            "thread_id": body.thread_id,
                            "compressed_at": datetime.now(timezone.utc).isoformat(),
                        },
                    }
                    # 摘要同步生成向量嵌入，保证语义检索可命中压缩摘要
                    try:
                        memory_payload["embedding"] = await llm.embedding.aembed_query(
                            summary[:2000]
                        )
                    except Exception as exc:
                        logger.warning(f"压缩摘要 embedding 生成失败: {exc}")
                    await memory_repo.create(user_id=user_id, data=memory_payload)
                except Exception as exc:
                    logger.warning(f"保存压缩摘要到 AgentMemory 失败: {exc}")

                # add_messages 只增不减，aupdate_state 传入消息子集无法删除
                # 旧消息，必须传 RemoveMessage 列表才能从 checkpoint 的 messages 通道真正裁剪。
                from langchain_core.messages import RemoveMessage

                # 安全裁剪：位置切片会拆散 AI tool_calls 与其 ToolMessage 响应的配对，
                # 用 safe_compress_cutoff 保证保留区不残留孤儿 ToolMessage。
                _cutoff = safe_compress_cutoff(messages, 20)
                kept_messages = messages[_cutoff:]
                removed_messages = messages[:_cutoff]
                graph = build_user_agent_graph(
                    db_manager.with_db,
                    model_config=model_config,
                    checkpointer=checkpoint,
                )
                await graph.aupdate_state(
                    config,
                    values={
                        "messages": [RemoveMessage(id=m.id) for m in removed_messages if getattr(m, "id", None)],
                        "compressed_context": summary,
                        "message_count_at_compress": len(messages),
                    },
                )

                removed_count = len(messages) - len(kept_messages)
                yield _sse_compress_done(summary, removed_count, len(kept_messages))
            finally:
                _pop_compress_task()
                await _release_thread_lock(_t_key, _t_holder)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers=_sse_headers(),
        )
    except Exception:
        _pop_compress_task()
        await _release_thread_lock(_t_key, _t_holder)
        raise
