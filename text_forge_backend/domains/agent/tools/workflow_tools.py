from typing import Annotated, Any

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from langgraph.config import get_config

from ..workflow_scheduler import execute_node as scheduler_execute_node
from ..workflow_scheduler import run_workflow as scheduler_run_workflow

logger = get_logger(__name__)


def build_workflow_tool(session_factory, model_config: dict | None = None):
    @tool
    async def execute_workflow_node(
        workflow_id: Annotated[str, "工作流 ID，从数据库中查找对应的工作流定义"],
        node_id: Annotated[str, "要执行的节点 ID，必须是该工作流中已定义的节点"],
        context_fields: Annotated[list[str] | None, "需要查询的结构化上下文字段列表，如 book_info/characters/outline/locations 等"] = None,
        upstream_outputs: Annotated[dict | None, "上游节点的输出映射，格式为 {node_id: text}"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行工作流中的单个节点，委托给调度器执行。

        Args:
            workflow_id: 工作流 ID。
            node_id: 要执行的节点 ID。
            context_fields: 需要查询的结构化上下文字段列表。
            upstream_outputs: 上游节点的输出映射。
        """
        logger.debug(f"[tool] execute_workflow_node  book_id={book_id}  workflow_id={workflow_id}  node_id={node_id}")
        async with session_factory() as session:
            from models.workflow import Workflow
            from sqlalchemy import select

            wf_stmt = select(Workflow).where(Workflow.id == workflow_id)
            wf_result = await session.execute(wf_stmt)
            workflow = wf_result.scalar_one_or_none()
            if not workflow:
                return {"status": "error", "message": f"工作流不存在: {workflow_id}"}

            nodes = workflow.nodes or []
            node = next((n for n in nodes if n.get("id") == node_id), None)
            if not node:
                return {"status": "error", "message": f"节点不存在: {node_id}"}

            node_label = node.get("label") or node.get("name") or node_id

            if context_fields:
                node["context_fields"] = context_fields

            if upstream_outputs:
                for uid, text in upstream_outputs.items():
                    if len(text) > 3000:
                        upstream_outputs[uid] = text[:3000] + "\n…（已截断）"

            result = await scheduler_execute_node(
                node_def=node,
                book_id=book_id,
                upstream_outputs=upstream_outputs,
                model_config=model_config,
                personal_rag_results=personal_rag_results,
            )

            return {
                "node_id": node_id,
                "node_label": node_label,
                "output": result.get("output", ""),
                "tokens": result.get("tokens", 0),
                "status": "completed" if result.get("success") else "error",
                "needs_review": result.get("needs_review", False),
                "quality_check": result.get("quality_check"),
            }

    @tool
    async def execute_workflow(
        workflow_id: Annotated[str, "工作流 ID"],
        instruction: Annotated[str | None, "额外的创作指令"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行完整工作流，按拓扑顺序自动运行所有节点。

        Agent 在收到用户"按工作流X生成"的指令时调用此工具，
        它一次性执行所有节点，只在中间出错或全部完成时才返回控制权给 Agent。

        Args:
            workflow_id: 工作流 ID。
            instruction: 额外创作指令（已弃用，由 Agent system prompt 控制）。
        """
        logger.debug(f"[tool] execute_workflow  book_id={book_id}  workflow_id={workflow_id}")

        progress_events: list[dict[str, Any]] = []

        def on_progress(event: dict[str, Any]):
            progress_events.append(event)
            logger.debug(f"[workflow-progress] {event.get('event')} {event.get('node_id')}")
            try:
                config = get_config()
                if config and hasattr(config, 'dispatch_custom_event'):
                    config.dispatch_custom_event(event.get("event", "progress"), event)
            except Exception:
                pass

        try:
            result = await scheduler_run_workflow(
                workflow_id=workflow_id,
                book_id=book_id,
                model_config=model_config or {},
                on_progress=on_progress,
                personal_rag_results=personal_rag_results,
            )
        except Exception as exc:
            logger.exception(f"execute_workflow 失败")
            return {
                "status": "error",
                "message": f"工作流执行失败: {exc}",
                "progress_events": progress_events,
            }

        result["progress_events"] = progress_events
        return result

    return [execute_workflow_node, execute_workflow]
