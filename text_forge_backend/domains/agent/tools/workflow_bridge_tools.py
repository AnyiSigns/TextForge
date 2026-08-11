from typing import Annotated

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

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
    from models.book import Book
    from sqlalchemy import select

    async with session_factory() as session:
        book = (
            await session.execute(select(Book).where(Book.id == book_id))
        ).scalar_one_or_none()
        return book.workflow_id if book else None


def build_workflow_bridge_tools(session_factory, model_config: dict | None = None):
    """构建工作流桥接工具。

    这些工具只把执行意图写入 state["pending_workflow"]，真正的执行交由
    原生 workflow_runner 节点（在那里 get_stream_writer 才能透出 node_* 事件）。
    """

    @tool
    async def execute_workflow(
        workflow_id: Annotated[str | None, "工作流 ID；不传时使用当前书籍绑定的工作流"] = None,
        instruction: Annotated[str | None, "额外的创作指令"] = None,
        target_chapter_id: Annotated[int | None, "目标章节 ID；指定后工作流各节点将按该章节写作目标生成"] = None,
        upstream_outputs: Annotated[dict | None, "上游节点的输出映射，格式为 {node_id: text}，注入每个工作流节点上下文"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行完整工作流，按拓扑顺序自动运行所有节点。

        Agent 在收到用户"按工作流X生成"的指令时调用此工具。工作流将在后台
        逐节点流式生成，过程中你会看到每个角色节点的实时创作内容。

        Args:
            workflow_id: 工作流 ID；不传时自动使用当前书籍绑定的工作流（book.workflow_id）。
            instruction: 额外创作指令（已弃用，由 Agent system prompt 控制）。
            target_chapter_id: 目标章节 ID；逐章生成时每章传入对应章节 ID。
            upstream_outputs: 上游节点输出映射，如 {node_id: text}，将作为起始上游输出注入每个节点。
        """
        logger.debug(f"[tool] execute_workflow(bridge)  book_id={book_id}  workflow_id={workflow_id}")
        if not workflow_id:
            workflow_id = await _resolve_book_workflow_id(session_factory, book_id)
            if not workflow_id:
                return {"status": "error", "message": "未指定工作流且该书未绑定工作流，请先在书籍设置中绑定工作流或提供工作流 ID"}
        pending: dict = {"workflow_id": workflow_id, "node_id": None}
        if target_chapter_id:
            pending["target_chapter_id"] = target_chapter_id
        if upstream_outputs:
            pending["upstream_outputs"] = upstream_outputs
        return {
            "pending_workflow": pending,
            "status": "queued",
            "message": "工作流已排队执行，请等待各节点流式输出完成。",
        }

    @tool
    async def execute_workflow_node(
        node_id: Annotated[str, "要执行的节点 ID，必须是该工作流中已定义的节点"],
        workflow_id: Annotated[str | None, "工作流 ID，从数据库中查找对应的工作流定义；不传时使用当前书籍绑定的工作流"] = None,
        target_chapter_id: Annotated[int | None, "目标章节 ID；指定后节点将按该章节写作目标生成"] = None,
        context_fields: Annotated[list[str] | None, "需要查询的结构化上下文字段列表，如 book_info/characters/outline/locations 等"] = None,
        upstream_outputs: Annotated[dict | None, "上游节点的输出映射，格式为 {node_id: text}"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行工作流中的单个节点。

        Agent 在需要单独运行某个角色节点（如执笔写手）并实时查看其创作过程时调用。

        Args:
            node_id: 要执行的节点 ID。
            workflow_id: 工作流 ID；不传时自动使用当前书籍绑定的工作流（book.workflow_id）。
            target_chapter_id: 目标章节 ID。
        """
        logger.debug(f"[tool] execute_workflow_node(bridge)  book_id={book_id}  node_id={node_id}")
        if not workflow_id:
            workflow_id = await _resolve_book_workflow_id(session_factory, book_id)
            if not workflow_id:
                return {"status": "error", "message": "未指定工作流且该书未绑定工作流，请先在书籍设置中绑定工作流或提供工作流 ID"}
        pending: dict = {"workflow_id": workflow_id, "node_id": node_id}
        if target_chapter_id:
            pending["target_chapter_id"] = target_chapter_id
        if context_fields:
            pending["context_fields"] = context_fields
        if upstream_outputs:
            pending["upstream_outputs"] = upstream_outputs
        return {
            "pending_workflow": pending,
            "status": "queued",
            "message": f"节点 {node_id} 已排队执行，请等待其实时创作输出。",
        }

    return [execute_workflow, execute_workflow_node]
