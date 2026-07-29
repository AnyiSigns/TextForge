import json
from typing import Dict, List, Literal

from agents.state import ParentState, ToolState, MainState, AuditState
from langgraph.types import StreamWriter
from langgraph.graph import END
from repository.context_config_repo import BookContextConfigRepository
from infrastructure.database import db_manager
from agents.tool_node import tool_node
from agents.main_node import main_node
from agents.audit_node import audit_node


CONTEXT_FIELD_MAP = {
    "input_summary": "input_summary",
    "input_worldview": "input_worldview",
    "input_brief_summary": "input_brief_summary",
    "input_characters": "input_characters",
    "input_recent_chapters": "input_recent_chapters",
    "input_outline": "input_outline",
}


def _build_context_payload(state: ParentState, fields: list[str]):
    payload = {"model_config": state["model_config"]}
    for f in fields:
        if f in CONTEXT_FIELD_MAP:
            payload[f] = state.get(f, "")
    return payload


def _to_serializable(value):
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


async def _load_context_pool(book_id: int) -> Dict[str, List[int]]:
    if not book_id:
        return {}
    async with db_manager.with_db() as session:
        repo = BookContextConfigRepository(session)
        return await repo.get_config(book_id)


async def manager_node(state: ParentState):
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
            print(
                f"节点 {node_id} 依赖未满足: 缺 {missing}，现有 outputs keys: {list(outputs.keys())}"
            )
            continue

        if all(dep in outputs for dep in deps):
            next_node = node
            break

    if not next_node:
        remaining = [n["id"] for n in nodes if n["id"] not in executed_set]
        if remaining:
            print(f"剩余节点{remaining}无法调度")
        else:
            print("所有节点执行完毕")
        return {"next_step_id": "__END__"}

    print(f"待调度:{next_node['label']}({next_node['id']})")

    outgoing = [
        e["from"] for e in state.get("edges", []) if e.get("to") == next_node["id"]
    ]
    context = {}
    for dep in outgoing:
        if dep in outputs:
            context[dep] = _to_serializable(outputs[dep])

    upstream_text = ""
    upstream_id = None
    for dep in outgoing:
        if dep in outputs:
            upstream_id = dep
            upstream_text = str(outputs[dep])
            break

    if len(upstream_text) > 8000:
        print(
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

    print(f"[Manager] 代码路由决策 -> {target_executor}")

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
    from agents.state import ToolState
    from agents.graphs.registry import graph_register

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
    from agents.state import MainState
    from agents.graphs.registry import graph_register

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
        **context_payload,
    }

    meta = metadata.get("_exec_meta") or {}
    payload["_exec_meta"] = {
        "node_id": meta.get("node_id", node_id),
        "node_label": meta.get("node_label", metadata.get("current_node_label", node_id)),
    }

    result = await graph_register.get_compiled("main_graph").ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def call_compression(state: ParentState) -> dict:
    from agents.state import AuditState
    from agents.graphs.registry import graph_register

    meta = state.get("metadata", {})
    compress_text = meta.get("compress_text", "")
    source_id = meta.get("compress_source_id", "unknown")
    node_id = f"{source_id}_compressed"
    compression_prompt = "请压缩以下长文本,保留关键情节和核心信息,上下文需要逻辑连贯。"

    context_pool = await _load_context_pool(state.get("book_id"))
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
    from agents.state import AuditState
    from agents.graphs.registry import graph_register

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt")
    context = state.get("step_outputs", {})
    workflow_node = metadata.get("workflow_node") or {}
    fields = workflow_node.get("context_fields") or [
        "setting",
        "characters",
        "outline",
        "volumes",
    ]

    context_pool = await _load_context_pool(state.get("book_id"))
    context_payload = _build_context_payload(state, fields)
    payload: AuditState = {
        "system_prompt": system_prompt,
        "input_context": context,
        "output": "",
        "model_config": state["model_config"],
        **context_payload,
    }

    meta = metadata.get("_exec_meta") or {}
    payload["_exec_meta"] = {
        "node_id": meta.get("node_id", node_id),
        "node_label": meta.get("node_label", metadata.get("current_node_label", node_id)),
    }

    result = await graph_register.get_compiled("audit_graph").ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def route_after_manager(
    state: ParentState,
) -> Literal["call_tool", "call_main", "call_compression", "call_audit", END]:
    next_id = state.get("next_step_id")
    if next_id == "__END__":
        return END

    if next_id == "__compress__":
        print("[路由] 压缩任务 -> call_compression")
        return "call_compression"

    target_executor = state.get("metadata", {}).get("target_executor", "main")

    executor_to_node = {
        "main": "call_main",
        "audit": "call_audit",
        "tool": "call_tool",
    }
    target_node = executor_to_node.get(target_executor, "call_main")
    print(f"[路由] {target_executor} -> {target_node}")
    return target_node