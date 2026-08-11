import time
from typing import Any

from config.logging import get_logger

from .workflow_scheduler import run_workflow as scheduler_run_workflow

logger = get_logger(__name__)


async def _finish_with_candidate(
    result: dict[str, Any],
    target_chapter_id: int | None = None,
    preferred_workflow_node: str | None = None,
    user_id: int = 0,
    book_id: int | None = None,
) -> dict[str, Any]:
    """工作流执行完毕后构造「候选正文确认」回复。

    直接把候选正文节点整理成一条 AIMessage 作为最终回复（不经 LLM），
    由 _entry_router 检测 candidate_reply_ready 后 END，避免模型在
    候选确认回合空转（反复 read_chapter_content 漏参）。

    若传入 preferred_workflow_node 且该节点存在于 content_nodes（用户之前已选过，
    多章生成自动沿用），则直接落库并告知用户，不再询问选择。

    Args:
        result: run_workflow / execute_node 的返回。
        target_chapter_id: 目标章节 ID。
        preferred_workflow_node: 用户最近一次选定的节点 ID（自动沿用，与
            state.preferred_workflow_node 命名一致）。
        user_id: 当前用户 ID。
        book_id: 当前书籍 ID。

    Returns:
        含 messages(展示回复)、workflow_result、candidate_reply_ready 的状态更新。
    """
    from langchain_core.messages import AIMessage

    content_nodes = result.get("content_nodes") or []
    target = result.get("target_chapter_id")
    logger.info(
        f"[workflow_runner] 收尾候选确认: status={result.get('status')} "
        f"content_nodes={len(content_nodes)} target_chapter_id={target} "
        f"preferred_workflow_node={preferred_workflow_node} "
        f"message={result.get('message', '')[:120]}"
    )

    # 自动沿用：用户已选过节点且候选仍包含该节点 → 直接落库，不再询问
    pending_review: dict | None = None
    if preferred_workflow_node and target_chapter_id:
        preferred = next(
            (n for n in content_nodes if n.get("node_id") == preferred_workflow_node),
            None,
        )
        if preferred:
            try:
                from sqlalchemy import func, select

                from models.book import Chapter, ChapterContent, Volume
                from shared.database import db_manager

                content = preferred.get("output", "") or ""
                label = preferred.get("node_label") or preferred_workflow_node
                if content and content.strip():
                    async with db_manager.with_db() as session:
                        # 必须校验归属：JOIN Volume 断言目标章节属于当前书籍，与
                        # tools_domain 四个写工具一致，防止跨书写入（IDOR）。
                        ch = (
                            await session.execute(
                                select(Chapter)
                                .join(Volume, Volume.id == Chapter.volume_id)
                                .where(
                                    Chapter.id == target_chapter_id,
                                    Volume.book_id == book_id,
                                )
                            )
                        ).scalar_one_or_none()
                        if ch and not ch.locked:
                            max_ver = (
                                await session.execute(
                                    select(func.max(ChapterContent.version)).where(
                                        ChapterContent.chapter_id == target_chapter_id
                                    )
                                )
                            ).scalar() or 0
                            session.add(
                                ChapterContent(
                                    chapter_id=target_chapter_id,
                                    content=content,
                                    version=max_ver + 1,
                                )
                            )
                            await session.commit()
                            # 写操作审计：工作流候选正文自动沿用落库留痕
                            try:
                                from .agent_nodes import _get_thread_id
                                from .metrics import record_write_audit

                                await record_write_audit(
                                    db_manager.with_db,
                                    thread_id=_get_thread_id(),
                                    user_id=user_id,
                                    book_id=book_id or None,
                                    tool_name="write_workflow_candidate",
                                    operation="workflow.auto_apply",
                                    args={
                                        "chapter_id": target_chapter_id,
                                        "node_id": preferred_workflow_node,
                                    },
                                    decision="auto",
                                    result="ok",
                                    meta={"label": label, "chars": len(content)},
                                )
                            except Exception as audit_exc:
                                logger.warning(
                                    f"[audit] 工作流自动沿用审计失败: {audit_exc}"
                                )
                            reply = (
                                f"已自动沿用您此前选定的【{label}】节点，将第{target_chapter_id}章正文写入章节库"
                                f"（第 {max_ver + 1} 版，{len(content)} 字）。如需改用其他节点输出，告诉我即可。"
                            )
                            logger.info(
                                f"[workflow_runner] 自动沿用落库成功: chapter={target_chapter_id} node={preferred_workflow_node}"
                            )
                            _persist_outputs_preferred: dict[str, dict] = {}
                            for n in content_nodes:
                                nid = n.get("node_id") or ""
                                if nid:
                                    _persist_outputs_preferred[nid] = {
                                        "output": n.get("output", ""),
                                        "label": n.get("node_label") or nid,
                                        "tokens": n.get("tokens", 0),
                                    }
                            return {
                                "messages": [AIMessage(content=reply)],
                                "workflow_result": result,
                                "workflow_node_outputs": _persist_outputs_preferred,
                                "pending_workflow": None,
                                "candidate_reply_ready": True,
                            }
                        reply = f"章节 {target_chapter_id} 不存在或已锁定，无法自动沿用落库，请检查后手动选择候选节点。"
                else:
                    reply = f"候选节点【{preferred_workflow_node}】输出为空，无法自动沿用落库，请重新选择候选节点。"
                content_nodes = []  # 自动沿用失败时不再展示候选，直接告知用户
            except Exception as exc:
                logger.exception(f"[workflow_runner] 自动沿用落库失败: {exc}")
                reply = f"自动沿用落库失败（{exc}），请重新选择候选节点。"

    if result.get("status") == "error":
        reply = f"工作流执行失败：{result.get('message', '未知错误')}"
    elif result.get("status") == "pending_review":
        node_label = result.get("pending_node_label", "")
        # 构造审核卡数据：写入 state 的 pending_review，由 router 层转为 review_card 事件
        # 推送给前端弹审核卡（接受/重试/自定义/终止）。当前端提交决策后 resume，
        # 由 gated_tool_node / review 流程继续执行。
        _node_results = result.get("node_results") or []
        _last = _node_results[-1] if _node_results else {}
        _qc = _last.get("quality_check", {})
        pending_review = {
            "node_id": result.get("pending_node_id", ""),
            "node_label": node_label,
            "workflow_id": result.get("workflow_id", ""),
            "output_preview": result.get("output", "")
            or (_last.get("output") or "")[:1000],
            "reason": _qc.get("reason", "输出质量不满足角色节点要求"),
            # 携带目标章节与所属工作流：用户审核决策后续跑时据此精确重跑该节点，
            # 避免 LLM 臆测节点 ID（如误把审计角色 auditor 当作工作流节点）。
            "target_chapter_id": target_chapter_id,
            # 任务 31：卡片展示节点 tokens 与耗时
            "tokens": _last.get("tokens", 0),
            "elapsed_ms": _last.get("elapsed_ms", 0),
        }
        reply = f"工作流在节点「{node_label}」触发审计拦截，需要您审核后再继续。请查看审核卡进行确认。"
    elif result.get("needs_review"):
        # 单节点重跑（如「重试」）后质量审计仍未通过：再次拦截，重新弹审核卡，
        # 使「重试 → 仍不合格 → 再审核」的循环可继续，而非直接当作候选呈现。
        _qc = result.get("quality_check") or {}
        node_label = result.get("node_label", "")
        pending_review = {
            "node_id": result.get("node_id", ""),
            "node_label": node_label,
            "workflow_id": result.get("workflow_id", ""),
            "output_preview": (result.get("output") or "")[:1000],
            "reason": _qc.get("reason", "输出质量不满足角色节点要求"),
            "target_chapter_id": target_chapter_id,
            # 任务 31：卡片展示节点 tokens 与耗时
            "tokens": result.get("tokens", 0),
            "elapsed_ms": result.get("elapsed_ms", 0),
        }
        reply = f"工作流在节点「{node_label}」触发审计拦截，需要您审核后再继续。请查看审核卡进行确认。"
    elif not content_nodes:
        if not reply:
            reply = "工作流执行完成，但没有产出可用的正文候选（可能是纯审计/规划类节点）。您可以指定具体章节或调整工作流后再试。"
    elif not pending_review:
        lines = [
            f"工作流执行完成，请选择哪个节点的输出作为{('第'+str(target)+'章') if target else '本章'}的正文："
        ]
        for i, n in enumerate(content_nodes, 1):
            summary = (n.get("summary") or "").strip()
            label = n.get("node_label") or n.get("node_id")
            # 不用「1. 」markdown 有序列表语法：ReactMarkdown 会把两条候选拆成两个
            # 独立 ol 都从 1 编号，用户无法区分。改用「候选序号」文本前缀。
            lines.append(
                f"\n候选{i}：【{label}】\n{summary if summary else '（无摘要）'}"
            )
        lines.append("\n回复「候选序号」（如：候选2）即可，我会用所选节点的输出落库。")
        reply = "\n".join(lines)

    logger.info(f"[workflow_runner] 候选确认回复前100字: {reply[:100]}")
    # 完整候选正文写入 workflow_node_outputs（merge_dicts 聚合字段，跨回合保留），
    # 供用户选定候选后 write_workflow_candidate 读取落库，避免 workflow_result
    # 在新回合被重置后正文丢失、Agent 只能看到 300 字摘要而误判截断。
    _persist_outputs: dict[str, dict] = {}
    for n in content_nodes:
        nid = n.get("node_id") or ""
        if nid:
            _persist_outputs[nid] = {
                "output": n.get("output", ""),
                "label": n.get("node_label") or nid,
                "tokens": n.get("tokens", 0),
            }
    _update = {
        "messages": [AIMessage(content=reply)],
        "workflow_result": result,
        "workflow_node_outputs": _persist_outputs,
        "pending_workflow": None,
        "candidate_reply_ready": True,
    }
    if pending_review:
        # 审计拦截时写入 pending_review，router 层据此推送 review_card 事件弹审核卡
        _update["pending_review"] = pending_review
    return _update


async def workflow_runner_node(state: dict[str, Any]) -> dict[str, Any]:
    """原生图节点：执行工作流并流式推送节点事件。

    由 Agent 在调用 execute_workflow / execute_workflow_node 工具时写入
    state["pending_workflow"] 触发。作为原生节点运行，get_stream_writer 可
    正常透出 node_* 自定义事件（工具内调用则无法透出）。

    Args:
        state: 含 pending_workflow 的 Agent 状态。

    Returns:
        写入 workflow_result 与清空 pending_workflow。
    """
    pending = state.get("pending_workflow")
    if not pending:
        logger.warning("[workflow_runner] state.pending_workflow 为空，直接返回")
        return {"pending_workflow": None}

    workflow_id = pending.get("workflow_id")
    node_id = pending.get("node_id")
    target_chapter_id = pending.get("target_chapter_id")
    book_id = state.get("active_book_id", 0) or 0
    user_id = state.get("user_id", 0)
    model_config = state.get("model_config") or {}
    logger.info(
        f"[workflow_runner] 开始执行 workflow_id={workflow_id} node_id={node_id} "
        f"target_chapter_id={target_chapter_id} book_id={book_id}"
    )

    def _on_progress(event: dict[str, Any]):
        # execute_node / run_workflow 内部已通过 stream_writer 直发 node_* 事件，
        # 这里不再转发，避免同一 token 事件被重复推送导致前端文本重复错乱。
        pass

    if node_id:
        # 单节点执行：直接调用 execute_node，复用同一流式通道
        from sqlalchemy import select

        from models.workflow import Workflow
        from shared.database import db_manager

        from .workflow_scheduler import execute_node as scheduler_execute_node

        async with db_manager.with_db() as session:
            wf_row = (
                await session.execute(
                    select(Workflow).where(Workflow.id == workflow_id)
                )
            ).scalar_one_or_none()
            if not wf_row:
                result = {"status": "error", "message": f"工作流不存在: {workflow_id}"}
            else:
                node_def = next(
                    (n for n in (wf_row.nodes or []) if n.get("id") == node_id), None
                )
                if not node_def:
                    result = {"status": "error", "message": f"节点不存在: {node_id}"}
                else:
                    node_label = (
                        node_def.get("label") or node_def.get("name") or node_id
                    )
                    context_fields = pending.get("context_fields")
                    if context_fields:
                        node_def = {**node_def, "context_fields": context_fields}
                    # 审核卡续跑的确定性分支：
                    # - forced_output：用户「修改」后直接用其作为节点输出，跳过生成与审计；
                    # - skip_audit：用户「接受」后重跑该节点但跳过自动审计，避免重复拦截死循环。
                    forced_output = pending.get("forced_output")
                    skip_audit = pending.get("skip_audit", False)
                    # 任务 31：单节点重跑也统计耗时（审核卡展示 tokens/耗时）
                    _node_started = time.monotonic()
                    if forced_output is not None:
                        res = {
                            "success": True,
                            "output": forced_output,
                            "needs_review": False,
                            "quality_check": {
                                "passed": True,
                                "reason": "用户已修改，使用修改后内容",
                            },
                        }
                    else:
                        try:
                            res = await scheduler_execute_node(
                                node_def=node_def,
                                book_id=book_id,
                                model_config=model_config,
                                node_id=node_id,
                                upstream_outputs=pending.get("upstream_outputs"),
                                personal_rag_results=state.get("personal_rag_results"),
                                on_progress=_on_progress,
                                target_chapter_id=target_chapter_id,
                                skip_quality_audit=skip_audit,
                            )
                        except Exception as exc:
                            # 兜底：单节点执行异常转 error 结果，避免整个图崩溃断流
                            logger.exception(
                                f"[workflow_runner] 单节点执行未捕获异常: {exc}"
                            )
                            res = {
                                "success": False,
                                "output": "",
                                "needs_review": False,
                                "quality_check": {
                                    "passed": False,
                                    "reason": f"节点执行异常: {exc}",
                                },
                            }
                    _node_elapsed_ms = round(
                        (time.monotonic() - _node_started) * 1000, 1
                    )
                    result = {
                        "node_id": node_id,
                        "node_label": node_label,
                        "workflow_id": workflow_id,
                        "output": res.get("output", ""),
                        "status": "completed" if res.get("success") else "error",
                        "needs_review": res.get("needs_review", False),
                        "quality_check": res.get("quality_check"),
                        # 任务 31：单节点重跑透传 tokens 与耗时（execute_node 返回 tokens）
                        "tokens": res.get("tokens", 0),
                        "elapsed_ms": _node_elapsed_ms,
                    }
                    # 单节点执行：该节点若是内容节点（executor=main），即作为唯一候选正文
                    _executor = node_def.get("executor")
                    if _executor == "main":
                        result["content_nodes"] = [
                            {
                                "node_id": node_id,
                                "node_label": node_label,
                                "output": res.get("output", ""),
                                "summary": (res.get("output") or "")[:300],
                            }
                        ]
                    else:
                        result["content_nodes"] = []
        return await _finish_with_candidate(
            result,
            target_chapter_id,
            state.get("preferred_workflow_node"),
            user_id,
            book_id,
        )

    try:
        result = await scheduler_run_workflow(
            workflow_id=workflow_id,
            book_id=book_id,
            model_config=model_config,
            on_progress=_on_progress,
            personal_rag_results=state.get("personal_rag_results"),
            seed_upstream_outputs=pending.get("upstream_outputs"),
            target_chapter_id=target_chapter_id,
        )
    except Exception as exc:
        # 兜底：调度器未捕获异常（如配置/LLM 层外的意外错误）不能让整个图崩溃，
        # 转为 error 结果走候选确认收尾，用户可见错误信息而非断流。
        logger.exception(f"[workflow_runner] 工作流执行未捕获异常: {exc}")
        result = {
            "status": "error",
            "message": f"工作流执行异常: {exc}",
            "content_nodes": [],
        }
    return await _finish_with_candidate(
        result,
        target_chapter_id,
        state.get("preferred_workflow_node"),
        user_id,
        book_id,
    )
