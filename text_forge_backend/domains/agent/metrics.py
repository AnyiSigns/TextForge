"""Agent 指标与写操作审计辅助。

指标层设计：
- 回合内跨节点累加保存在 state.turn_metrics（merge_metrics reducer 数值相加），
  包括 llm_calls / tool_calls / tool_success / tool_fail / compress_count /
  approval_count / approval_accept 与按子图分布的 subgraph_usage。
- 回合结束由 stream_agent 汇总 duration_ms 后：
  1) 发 `turn_metrics` SSE 事件（前端状态栏/日志共用， 事件透传的扩展）；
  2) 落库 agent_turn_metrics 表（决策数据来源，支持查询统计）；
  3) 结构化日志输出。

写操作审计：
- gated_tool_node 拦截写工具时记录 pending，执行后按决策记录结果；
- review_action 端点记录用户决策；写工具直执行路径也留痕。
- 审计写入全部 best-effort（try/except 包裹），绝不影响主流程。
"""
import json
import time

from config.logging import get_logger

logger = get_logger(__name__)


def _subgraph_usage(turn_metrics: dict) -> dict:
    """把 llm_calls_per_subgraph 等嵌套指标展开为按子图统计的明细。"""
    return {
        "llm_calls_per_subgraph": dict(
            (turn_metrics.get("llm_calls_per_subgraph") or {})
        ),
        "tool_calls_per_subgraph": dict(
            (turn_metrics.get("tool_calls_per_subgraph") or {})
        ),
    }


def build_turn_metrics_payload(
    final_state: dict,
    started_at: float,
) -> dict:
    """把 state.turn_metrics 汇总为可落库/下发/记录的指标字典。

    Args:
        final_state: 图执行结束后的最终 state。
        started_at: time.monotonic() 回合开始时间。

    Returns:
        指标字典（含 duration_ms 与按子图明细）。
    """
    tm = final_state.get("turn_metrics") or {}
    duration_ms = round((time.monotonic() - started_at) * 1000, 1)
    # steps_per_subgraph 存在独立的 subgraph_steps 通道（agent_call 写入），
    # 不从 turn_metrics 读取，否则恒为空（step cap 调参数据丢失）。
    # thread_id 由调用方（router.py）事后用真实值覆盖，
    # 此处不再从 state 读不存在的 _thread_id 死键。
    payload = {
        "thread_id": "",
        "subgraph": final_state.get("subgraph") or "",
        "duration_ms": duration_ms,
        "llm_calls": tm.get("llm_calls", 0),
        "tool_calls": tm.get("tool_calls", 0),
        "tool_success": tm.get("tool_success", 0),
        "tool_fail": tm.get("tool_fail", 0),
        "compress_count": tm.get("compress_count", 0),
        "approval_count": tm.get("approval_count", 0),
        "approval_accept": tm.get("approval_accept", 0),
        "details": {
            **_subgraph_usage(tm),
            "steps_per_subgraph": dict(final_state.get("subgraph_steps") or {}),
        },
    }
    return payload


def sse_turn_metrics_line(payload: dict) -> str:
    """构造 turn_metrics SSE 事件行（2.3 契约统一：指标整体嵌套在 metrics 字段下）。"""
    return (
        f"data: {json.dumps({'type': 'turn_metrics', 'metrics': payload}, ensure_ascii=False)}\n\n"
    )


async def persist_turn_metrics(
    session_factory,
    user_id: int,
    book_id: int | None,
    payload: dict,
) -> None:
    """把回合指标落库（best-effort）。"""
    try:
        from models.agent_metric import AgentTurnMetric

        # 无书籍会话的 book_id 可能是 0（历史约定），但该列为 FK，0 会触发外键违例。
        # 统一归一到 None，保证书外会话指标也能落库。
        book_id = book_id or None
        async with session_factory() as session:
            session.add(
                AgentTurnMetric(
                    user_id=user_id,
                    book_id=book_id,
                    thread_id=(payload.get("thread_id") or "")[:255],
                    subgraph=(payload.get("subgraph") or "")[:32],
                    duration_ms=payload.get("duration_ms") or 0,
                    llm_calls=payload.get("llm_calls") or 0,
                    tool_calls=payload.get("tool_calls") or 0,
                    tool_success=payload.get("tool_success") or 0,
                    tool_fail=payload.get("tool_fail") or 0,
                    compress_count=payload.get("compress_count") or 0,
                    approval_count=payload.get("approval_count") or 0,
                    approval_accept=payload.get("approval_accept") or 0,
                    details=payload.get("details") or {},
                )
            )
            await session.commit()
    except Exception as exc:
        logger.warning(f"[metrics] 回合指标落库失败: {exc}")


async def record_write_audit(
    session_factory,
    *,
    thread_id: str,
    user_id: int,
    book_id: int | None,
    tool_name: str,
    operation: str,
    args: dict | None,
    decision: str = "",
    result: str = "",
    meta: dict | None = None,
) -> None:
    """记录一次写操作审计（best-effort，失败不影响主流程）。

    见 record_write_audits 的归一化/截断规则；单条场景复用批量实现。
    """
    await record_write_audits(
        session_factory,
        [
            {
                "thread_id": thread_id,
                "user_id": user_id,
                "book_id": book_id,
                "tool_name": tool_name,
                "operation": operation,
                "args": args,
                "decision": decision,
                "result": result,
                "meta": meta,
            }
        ],
    )


async def record_write_audits(
    session_factory,
    rows: list[dict],
) -> None:
    """批量写操作审计（best-effort，一次事务，失败不影响主流程）。

    统一归一化/截断：tool_name 可能来自用户定义的工作流 node_id（无长度约束），
    直接超长写入会触发 StringDataRightTruncation，导致审计行被吞（决策已生效
    但无留痕，可被利用的反取证路径）；book_id=0 历史约定与 FK 冲突，归一到 None。
    """
    if not rows:
        return
    try:
        from models.agent_audit import AgentWriteAudit

        async with session_factory() as session:
            for row in rows:
                args = row.get("args") or {}
                args_summary = ""
                try:
                    args_summary = json.dumps(args, ensure_ascii=False, default=str)[:2000]
                except Exception:
                    args_summary = ""
                session.add(
                    AgentWriteAudit(
                        thread_id=(row.get("thread_id") or "")[:255],
                        user_id=row.get("user_id", 0),
                        book_id=row.get("book_id") or None,
                        tool_name=(row.get("tool_name") or "")[:64],
                        operation=(row.get("operation") or "")[:64],
                        args_summary=args_summary,
                        decision=(row.get("decision") or "")[:16],
                        result=(row.get("result") or "")[:64],
                        meta=row.get("meta") or {},
                    )
                )
            await session.commit()
    except Exception as exc:
        # 审计记录失败属于安全关切（决策已生效但无留痕），升级为 error 便于告警
        logger.error(f"[audit] 写操作审计批量记录失败: {exc}")
