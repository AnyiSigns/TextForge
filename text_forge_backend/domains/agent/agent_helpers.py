"""Agent 节点公共辅助：custom 事件、写工具审计行、子图入口 auto-recall 记忆。"""
import time

from config.logging import get_logger
from langchain_core.messages import HumanMessage

from .agent_state import UserAgentState

logger = get_logger(__name__)

# 子图入口 auto-recall 的 per-turn 缓存。
# key = (user_id, book_id, 最后一条用户消息前 500 字)，同一回合内子图被多次调用
# （工具循环回跳）时命中缓存，避免对同一句用户指令重复做语义检索烧 token。
_AUTO_RECALL_CACHE: dict[tuple, tuple[float, list]] = {}
_AUTO_RECALL_TTL = 300  # 5 分钟过期，防止缓存无限增长
_AUTO_RECALL_MAX_SIZE = 512  # 容量上限：超出后清理最早写入的条目，防进程级内存缓慢增长


def _auto_recall_key(state: UserAgentState) -> tuple | None:
    """构造 auto-recall 缓存 key；无 book_id / 无新用户消息时不检索。"""
    user_id = state.get("user_id")
    book_id = state.get("active_book_id", 0) or 0
    if user_id is None or not book_id:
        return None
    messages = state.get("messages", [])
    last_human = None
    for m in reversed(messages):
        if isinstance(m, HumanMessage):
            last_human = (m.content or "") if isinstance(m.content, str) else ""
            break
    if not last_human or not last_human.strip():
        return None
    return (user_id, book_id, last_human.strip()[:500])


async def _auto_recall(state: UserAgentState) -> list:
    """子图入口自动记忆检索：按「最后一条用户消息」语义检索本作品记忆并注入子图 prompt。

    成本控制：per-turn 缓存（同一用户回合只查一次）、top_k=3、book_id 为空跳过。
    检索失败静默降级（返回空列表），不影响主流程。
    """
    key = _auto_recall_key(state)
    if key is None:
        return []
    now = time.monotonic()
    cached = _AUTO_RECALL_CACHE.get(key)
    if cached and now - cached[0] < _AUTO_RECALL_TTL:
        return cached[1]
    results: list = []
    try:
        from shared.database import db_manager

        from domains.memory.service import AgentMemoryService

        user_id, book_id, query = key
        async with db_manager.session_factory() as session:
            svc = AgentMemoryService(session)
            results = await svc.search_memories(
                user_id=user_id,
                mode="semantic",
                query=query,
                book_id=book_id,
                top_k=3,
                model_config=state.get("model_config"),
            )
            if not results:
                results = await svc.search_memories(
                    user_id=user_id,
                    mode="fulltext",
                    query=query,
                    book_id=book_id,
                    top_k=3,
                    model_config=None,
                )
    except Exception as exc:
        logger.warning(f"[auto_recall] 记忆检索失败: {exc}")
    _AUTO_RECALL_CACHE[key] = (now, results)
    if len(_AUTO_RECALL_CACHE) > _AUTO_RECALL_MAX_SIZE:
        try:
            for _expired_key in list(_AUTO_RECALL_CACHE)[
                : len(_AUTO_RECALL_CACHE) // 2
            ]:
                _AUTO_RECALL_CACHE.pop(_expired_key, None)
        except Exception:  # 缓存清理失败不影响主流程
            pass
    return results


def _emit_custom(state: UserAgentState, etype: str, **kw) -> None:
    """向 custom 通道写结构化事件（前端状态栏/进度/日志共用）。"""
    try:
        from langgraph.config import get_stream_writer

        writer = get_stream_writer()
        if writer is not None:
            writer({"event": etype, **kw})
    except Exception:
        pass


def _get_thread_id() -> str:
    """从 LangGraph 运行时配置读取当前 thread_id（写操作审计用）。"""
    try:
        from langgraph.config import get_config

        cfg = get_config()
        return (cfg.get("configurable") or {}).get("thread_id") or ""
    except Exception:
        return ""


def _audit_write_row(
    state: UserAgentState,
    head: dict,
    operation: str | None,
    decision: str = "",
    result: dict | None = None,
) -> dict:
    """构造写工具审计行（不落库，由调用方批量提交，减少每工具一次 DB 事务）。

    写工具门控/执行留痕。行数据随后交给 metrics.record_write_audits
    一次性写入；best-effort，失败不影响主流程。
    """
    result_status = ""
    if result is not None:
        result_status = (
            "cancelled"
            if result.get("cancelled")
            else "error" if result.get("error") else "ok"
        )
    return {
        "thread_id": _get_thread_id(),
        "user_id": state.get("user_id", 0),
        "book_id": state.get("active_book_id", 0) or None,
        "tool_name": head.get("tool_name", ""),
        "operation": operation or "",
        "args": head.get("tool_args") or {},
        "decision": decision,
        "result": result_status,
        "meta": {"subgraph": state.get("subgraph", "")},
    }


async def _flush_audit_rows(session_factory, rows: list[dict]) -> None:
    """批量提交写工具审计行（best-effort，失败不影响主流程）。"""
    try:
        from .metrics import record_write_audits

        await record_write_audits(session_factory, rows)
    except Exception as exc:
        logger.warning(f"[audit] 写工具审计批量提交失败: {exc}")


__all__ = [
    "_AUTO_RECALL_CACHE",
    "_AUTO_RECALL_MAX_SIZE",
    "_AUTO_RECALL_TTL",
    "_audit_write_row",
    "_auto_recall",
    "_auto_recall_key",
    "_emit_custom",
    "_flush_audit_rows",
    "_get_thread_id",
]
