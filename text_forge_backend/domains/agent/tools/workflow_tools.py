from typing import Annotated, Any

from langchain_core.tools import tool
from langgraph.config import get_stream_writer
from langgraph.prebuilt import InjectedState

from config.logging import get_logger

from ..workflow_scheduler import execute_node as scheduler_execute_node
from ..workflow_scheduler import run_workflow as scheduler_run_workflow

logger = get_logger(__name__)


async def _resolve_book_workflow_id(session_factory, book_id: int) -> str | None:
    """按书籍 ID 解析绑定的工作流 ID；未绑定返回 None。

    Args:
        session_factory: 数据库会话工厂。
        book_id: 书籍 ID。

    Returns:
        书籍绑定的工作流 ID，或 None。
    """
    if not book_id:
        return None
    from sqlalchemy import select

    from models.book import Book

    async with session_factory() as session:
        book = (
            await session.execute(select(Book).where(Book.id == book_id))
        ).scalar_one_or_none()
        return book.workflow_id if book else None


def build_workflow_tool(session_factory, model_config: dict | None = None):
    @tool
    async def execute_workflow_node(
        node_id: Annotated[str, "要执行的节点 ID，必须是该工作流中已定义的节点"],
        workflow_id: Annotated[str | None, "工作流 ID，从数据库中查找对应的工作流定义；不传时使用当前书籍绑定的工作流"] = None,
        target_chapter_id: Annotated[int | None, "目标章节 ID；指定后节点将按该章节写作目标（标题/摘要/前章衔接）生成"] = None,
        context_fields: Annotated[list[str] | None, "需要查询的结构化上下文字段列表，如 book_info/characters/outline/locations 等"] = None,
        upstream_outputs: Annotated[dict | None, "上游节点的输出映射，格式为 {node_id: text}"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行工作流中的单个节点，委托给调度器执行。

        Args:
            node_id: 要执行的节点 ID。
            workflow_id: 工作流 ID；不传时自动使用当前书籍绑定的工作流（book.workflow_id）。
            target_chapter_id: 目标章节 ID。
            context_fields: 需要查询的结构化上下文字段列表。
            upstream_outputs: 上游节点的输出映射。
        """
        logger.debug(f"[tool] execute_workflow_node  book_id={book_id}  workflow_id={workflow_id}  node_id={node_id}")
        if not workflow_id:
            workflow_id = await _resolve_book_workflow_id(session_factory, book_id)
            if not workflow_id:
                return {"status": "error", "message": "未指定工作流且该书未绑定工作流，请先在书籍设置中绑定工作流或提供工作流 ID"}
        async with session_factory() as session:
            from sqlalchemy import select

            from models.workflow import Workflow

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

            stream_events: list[dict[str, Any]] = []
            stream_writer = get_stream_writer()

            def _on_progress(event: dict[str, Any]):
                event_type = event.get("event")
                if event_type == "node_stream":
                    stream_events.append(event)
                    try:
                        stream_writer(event)
                    except Exception:
                        logger.warning("[workflow] stream_writer(node_stream) 失败", exc_info=True)

            result = await scheduler_execute_node(
                node_def=node,
                book_id=book_id,
                upstream_outputs=upstream_outputs,
                model_config=model_config,
                personal_rag_results=personal_rag_results,
                node_id=node_id,
                on_progress=_on_progress,
                target_chapter_id=target_chapter_id,
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
        workflow_id: Annotated[str | None, "工作流 ID；不传时使用当前书籍绑定的工作流"] = None,
        instruction: Annotated[str | None, "额外的创作指令"] = None,
        target_chapter_id: Annotated[int | None, "目标章节 ID；指定后工作流各节点将按该章节写作目标（标题/摘要/前章衔接/关联事件）生成"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行完整工作流，按拓扑顺序自动运行所有节点。

        Agent 在收到用户"按工作流X生成"的指令时调用此工具，
        它一次性执行所有节点，只在中间出错或全部完成时才返回控制权给 Agent。

        Args:
            workflow_id: 工作流 ID；不传时自动使用当前书籍绑定的工作流（book.workflow_id）。
            instruction: 额外创作指令（已弃用，由 Agent system prompt 控制）。
            target_chapter_id: 目标章节 ID；逐章生成时每章传入对应章节 ID。
        """
        logger.debug(f"[tool] execute_workflow  book_id={book_id}  workflow_id={workflow_id}")

        if not workflow_id:
            workflow_id = await _resolve_book_workflow_id(session_factory, book_id)
            if not workflow_id:
                return {"status": "error", "message": "未指定工作流且该书未绑定工作流，请先在书籍设置中绑定工作流或提供工作流 ID"}

        progress_events: list[dict[str, Any]] = []

        def on_progress(event: dict[str, Any]):
            progress_events.append(event)
            logger.debug(f"[workflow-progress] {event.get('event')} {event.get('node_id')}")
            if event.get("event") == "node_stream":
                try:
                    get_stream_writer()(event)
                except Exception:
                    logger.warning("[workflow] stream_writer(node_stream) 失败", exc_info=True)

        try:
            result = await scheduler_run_workflow(
                workflow_id=workflow_id,
                book_id=book_id,
                model_config=model_config or {},
                on_progress=on_progress,
                personal_rag_results=personal_rag_results,
                target_chapter_id=target_chapter_id,
            )
        except Exception as exc:
            logger.exception("execute_workflow 失败")
            return {
                "status": "error",
                "message": f"工作流执行失败: {exc}",
                "progress_events": progress_events,
            }

        result["progress_events"] = progress_events
        return result

    return [execute_workflow_node, execute_workflow]
