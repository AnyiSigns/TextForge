from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from config.logging import get_logger

logger = get_logger(__name__)


def build_workflow_bridge_tools(session_factory, model_config: dict | None = None):
    """构建工作流桥接工具。

    这些工具只把执行意图写入 state["pending_workflow"]，真正的执行交由
    原生 workflow_runner 节点（在那里 get_stream_writer 才能透出 node_* 事件）。
    """

    @tool
    async def execute_workflow(
        workflow_id: Annotated[str, "工作流 ID"],
        instruction: Annotated[str | None, "额外的创作指令"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """执行完整工作流，按拓扑顺序自动运行所有节点。

        Agent 在收到用户"按工作流X生成"的指令时调用此工具。工作流将在后台
        逐节点流式生成，过程中你会看到每个角色节点的实时创作内容。

        Args:
            workflow_id: 工作流 ID。
            instruction: 额外创作指令（已弃用，由 Agent system prompt 控制）。
        """
        logger.debug(f"[tool] execute_workflow(bridge)  book_id={book_id}  workflow_id={workflow_id}")
        return {
            "pending_workflow": {
                "workflow_id": workflow_id,
                "node_id": None,
            },
            "status": "queued",
            "message": "工作流已排队执行，请等待各节点流式输出完成。",
        }

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
        """执行工作流中的单个节点。

        Agent 在需要单独运行某个角色节点（如执笔写手）并实时查看其创作过程时调用。

        Args:
            workflow_id: 工作流 ID。
            node_id: 要执行的节点 ID。
        """
        logger.debug(f"[tool] execute_workflow_node(bridge)  book_id={book_id}  node_id={node_id}")
        pending: dict = {"workflow_id": workflow_id, "node_id": node_id}
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
