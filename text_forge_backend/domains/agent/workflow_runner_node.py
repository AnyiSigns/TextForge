from typing import Any

from langgraph.config import get_stream_writer

from config.logging import get_logger

from .workflow_scheduler import run_workflow as scheduler_run_workflow

logger = get_logger(__name__)


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
        return {"pending_workflow": None}

    workflow_id = pending.get("workflow_id")
    node_id = pending.get("node_id")
    book_id = state.get("active_book_id", 0) or 0
    user_id = state.get("user_id", 0)
    model_config = state.get("model_config") or {}

    try:
        stream_writer = get_stream_writer()
    except Exception:
        stream_writer = None

    def _on_progress(event: dict[str, Any]):
        if stream_writer is not None:
            try:
                stream_writer(event)
            except Exception:
                pass

    if node_id:
        # 单节点执行：直接调用 execute_node，复用同一流式通道
        from sqlalchemy import select

        from models.workflow import Workflow
        from shared.database import db_manager

        from .workflow_scheduler import execute_node as scheduler_execute_node

        async with db_manager.with_db() as session:
            wf_row = (await session.execute(select(Workflow).where(Workflow.id == workflow_id))).scalar_one_or_none()
            if not wf_row:
                result = {"status": "error", "message": f"工作流不存在: {workflow_id}"}
            else:
                node_def = next((n for n in (wf_row.nodes or []) if n.get("id") == node_id), None)
                if not node_def:
                    result = {"status": "error", "message": f"节点不存在: {node_id}"}
                else:
                    node_label = node_def.get("label") or node_def.get("name") or node_id
                    res = await scheduler_execute_node(
                        node_def=node_def,
                        book_id=book_id,
                        model_config=model_config,
                        node_id=node_id,
                        on_progress=_on_progress,
                    )
                    result = {
                        "node_id": node_id,
                        "node_label": node_label,
                        "output": res.get("output", ""),
                        "status": "completed" if res.get("success") else "error",
                        "needs_review": res.get("needs_review", False),
                        "quality_check": res.get("quality_check"),
                    }
        return {"workflow_result": result, "pending_workflow": None}

    result = await scheduler_run_workflow(
        workflow_id=workflow_id,
        book_id=book_id,
        model_config=model_config,
        on_progress=_on_progress,
        personal_rag_results=state.get("personal_rag_results"),
    )
    return {"workflow_result": result, "pending_workflow": None}
