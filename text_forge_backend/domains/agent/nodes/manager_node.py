from typing import Dict, List
from ..state import ParentState, ToolState, MainState, AuditState
from langgraph.graph import END
from domains.book.context_config_repository import BookContextConfigRepository
from shared.database import db_manager
from config.logging import get_logger

logger = get_logger(__name__)


CONTEXT_FIELD_MAP = {
    "input_summary": "input_summary",
    "input_worldview": "input_worldview",
    "input_brief_summary": "input_brief_summary",
    "input_characters": "input_characters",
    "input_recent_chapters": "input_recent_chapters",
    "input_outline": "input_outline",
}


def _build_context_payload(state: ParentState, fields: list[str]):
    """构建上下文载荷。

    Args:
        state: 父图状态。
        fields: 需要的上下文字段列表。

    Returns:
        上下文载荷字典。
    """
    payload = {"model_config": state["model_config"]}
    for f in fields:
        if f in CONTEXT_FIELD_MAP:
            payload[f] = state.get(f, "")
    return payload


def _to_serializable(value):
    """将值转换为可 JSON 序列化的格式。"""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


async def _load_context_pool(book_id: int) -> Dict[str, List[int]]:
    """加载书籍上下文池。

    Args:
        book_id: 书籍 ID。

    Returns:
        上下文字段映射字典。
    """
    if not book_id:
        return {}
    async with db_manager.with_db() as session:
        repo = BookContextConfigRepository(session)
        return await repo.get_config(book_id)


async def manager_node(state: ParentState):
    """Manager 节点，负责工作流调度决策。

    Args:
        state: 父图状态。

    Returns:
        调度结果，包含 next_step_id 与 metadata。
    """
    nodes = state["workflow_nodes"]
    edges = state.get("edges", [])
    outputs = state.get("step_outputs", {})
    executed_set = set(state.get("executed_steps", []))

    next_node = None
    for node in nodes:
        node_id = node["id"]
        if node_id in executed_set:
            continue
        deps = [e["from"] for e in edges if e.get("to") == node_id]
        missing = [d for d in deps if d not in outputs]
        if missing:
            logger.warning(
                f"节点 {node_id} 依赖未满足: 缺 {missing}，现有 outputs keys: {list(outputs.keys())}"
            )
            continue

        if all(dep in outputs for dep in deps):
            next_node = node
            break

    if not next_node:
        remaining = [n["id"] for n in nodes if n["id"] not in executed_set]
        if remaining:
            logger.warning(f"剩余节点{remaining}无法调度")
        else:
            logger.info("所有节点执行完毕")
        return {"next_step_id": "__END__"}

    logger.info(f"待调度:{next_node['label']}({next_node['id']})")

    predecessors = [
        e["from"] for e in state.get("edges", []) if e.get("to") == next_node["id"]
    ]
    context = {}
    for dep in predecessors:
        if dep in outputs:
            context[dep] = _to_serializable(outputs[dep])

    upstream_text = ""
    upstream_id = None
    for dep in predecessors:
        if dep in outputs:
            upstream_id = dep
            upstream_text = str(outputs[dep])
            break

    if len(upstream_text) > 8000:
        logger.info(
            f"[压缩] 节点 {upstream_id} 输出 {len(upstream_text)} 字符，超过 8000 阈值，路由到压缩节点"
        )
        return {
            "next_step_id": "__compress__",
            "metadata": {
                "current_node_id": next_node["id"],
                "current_node_label": next_node.get("label", next_node["id"]),
                "current_system_prompt": next_node.get("system_prompt", ""),
                "current_context": context,
                "workflow_node": next_node,
                "compress_source_id": upstream_id,
                "compress_text": upstream_text,
            },
        }

    executor = next_node.get("executor") or "auto"
    if executor == "auto":
        if next_node.get("rag_filter") or next_node.get("context_fields"):
            target_executor = "tool"
        else:
            target_executor = "main"
    else:
        target_executor = executor

    logger.info(f"[Manager] 代码路由决策 -> {target_executor}")

    return {
        "next_step_id": next_node["id"],
        "metadata": {
            "current_node_id": next_node["id"],
            "current_node_label": next_node.get("label", next_node["id"]),
            "current_system_prompt": next_node.get("system_prompt", ""),
            "current_context": context,
            "workflow_node": next_node,
            "target_executor": target_executor,
        },
    }


async def call_tool(state: ParentState) -> dict:
    """调用工具执行节点。

    Args:
        state: 父图状态。

    Returns:
        工具执行结果。
    """
    from ..graphs.registry import graph_register

    metadata = state.get("metadata", {})
    workflow_node = metadata.get("workflow_node")
    book_id = state.get("book_id")

    if not workflow_node:
        return {
            "step_outputs": {"step_tool": "错误：缺少 workflow_node 配置"},
            "executed_steps": ["step_tool"],
        }

    query = f"{state.get('book_title', '')} {state.get('book_description', '')} {state.get('book_genre', '')}".strip()
    if not query:
        query = "本书"

    context_fields = workflow_node.get("context_fields") or []
    context_pool = await _load_context_pool(book_id)

    meta = metadata.get("_exec_meta") or {}
    node_id = meta.get("node_id", metadata.get("current_node_id", "step_tool"))
    node_label = meta.get("node_label", metadata.get("current_node_label", "工具"))

    payload: ToolState = {
        "query": query,
        "project_id": book_id,
        "workflow_node": workflow_node,
        "model_config": state["model_config"],
        "tool_result": "",
        "context_pool": context_pool,
        "context_fields": context_fields,
        "_exec_meta": {
            "node_id": node_id,
            "node_label": node_label,
        },
    }

    result = await graph_register.get_compiled("tool_graph").ainvoke(payload)
    return {
        "step_outputs": {"step_tool": result.get("tool_result", "")},
        "executed_steps": ["step_tool"],
    }


async def call_main(state: ParentState) -> dict:
    """调用主模型执行节点。

    Args:
        state: 父图状态。

    Returns:
        主模型执行结果。
    """
    from ..graphs.registry import graph_register

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt", "")
    context = metadata.get("current_context", {})
    workflow_node = metadata.get("workflow_node") or {}
    fields = workflow_node.get("context_fields") or []

    context_pool = await _load_context_pool(state.get("book_id"))
    context_payload = _build_context_payload(state, fields)
    payload: MainState = {
        "system_prompt": system_prompt,
        "input_context": context,
        "output": "",
        "model_config": state["model_config"],
        "context_pool": context_pool,
        "context_fields": fields,
        "project_id": state.get("book_id"),
        **context_payload,
    }

    meta = metadata.get("_exec_meta") or {}
    payload["_exec_meta"] = {
        "node_id": meta.get("node_id", node_id),
        "node_label": meta.get(
            "node_label", metadata.get("current_node_label", node_id)
        ),
    }

    result = await graph_register.get_compiled("main_graph").ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def call_compression(state: ParentState) -> dict:
    """调用压缩节点。

    Args:
        state: 父图状态。

    Returns:
        压缩结果。
    """
    from ..graphs.registry import graph_register

    meta = state.get("metadata", {})
    compress_text = meta.get("compress_text", "")
    source_id = meta.get("compress_source_id", "unknown")
    node_id = f"{source_id}_compressed"
    compression_prompt = "请压缩以下长文本,保留关键情节和核心信息,上下文需要逻辑连贯。"

    payload: AuditState = {
        "system_prompt": compression_prompt,
        "input_context": {"text": compress_text},
        "output": "",
        "model_config": state["model_config"],
        "input_worldview": "",
        "input_characters": "",
        "input_brief_summary": "",
        "input_recent_chapters": "",
        "input_outline": "",
        "context_pool": {},
        "context_fields": [],
        "_exec_meta": {
            "node_id": node_id,
            "node_label": f"{source_id}压缩",
        },
    }

    result = await graph_register.get_compiled("compression_graph").ainvoke(payload)
    return {
        "step_outputs": {node_id: result["output"]},
        "executed_steps": ["__compress__"],
    }


async def call_audit(state: ParentState) -> dict:
    """调用审核节点。

    Args:
        state: 父图状态。

    Returns:
        审核结果。
    """
    from ..graphs.registry import graph_register

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt")
    context = state.get("step_outputs", {})
    workflow_node = metadata.get("workflow_node") or {}
    fields = workflow_node.get("context_fields") or [
        "input_summary",
        "input_worldview",
        "input_characters",
        "input_outline",
    ]

    context_pool = await _load_context_pool(state.get("book_id"))
    context_payload = _build_context_payload(state, fields)
    payload: AuditState = {
        "system_prompt": system_prompt,
        "input_context": context,
        "output": "",
        "model_config": state["model_config"],
        "context_pool": context_pool,
        "context_fields": fields,
        "project_id": state.get("book_id"),
        **context_payload,
    }

    meta = metadata.get("_exec_meta") or {}
    payload["_exec_meta"] = {
        "node_id": meta.get("node_id", node_id),
        "node_label": meta.get(
            "node_label", metadata.get("current_node_label", node_id)
        ),
    }

    result = await graph_register.get_compiled("audit_graph").ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def route_after_manager(
    state: ParentState,
):
    """Manager 节点后的路由函数。

    Args:
        state: 父图状态。

    Returns:
        下一节点名称或 END。
    """
    next_id = state.get("next_step_id")
    if next_id == "__END__":
        return END

    if next_id == "__compress__":
        logger.info("[路由] 压缩任务 -> call_compression")
        return "call_compression"

    target_executor = state.get("metadata", {}).get("target_executor", "main")

    executor_to_node = {
        "main": "call_main",
        "audit": "call_audit",
        "tool": "call_tool",
    }
    target_node = executor_to_node.get(target_executor, "call_main")
    logger.info(f"[路由] {target_executor} -> {target_node}")
    return target_node
