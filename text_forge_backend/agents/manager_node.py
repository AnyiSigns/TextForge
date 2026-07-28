import json
from typing import Literal
from agents.state import ParentState
from langgraph.graph import END, START, StateGraph


CONTEXT_FIELD_MAP = {
    "input_summary": "input_summary",
    "input_worldview": "input_worldview",
    "input_brief_summary": "input_brief_summary",
    "input_characters": "input_characters",
    "input_recent_chapters": "input_recent_chapters",
    "input_outline": "input_outline",
}


def _to_serializable(value):
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


def _build_context_payload(state: ParentState, fields: list[str]):
    payload = {"model_config": state["model_config"]}
    for f in fields:
        if f in CONTEXT_FIELD_MAP:
            payload[f] = state.get(f, "")
    return payload


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

    outgoing = [e["from"] for e in state.get("edges", []) if e.get("to") == next_node["id"]]
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

    if next_node.get("rag_filter") or next_node.get("context_fields"):
        target_executor = "tool"
    else:
        target_executor = "main"

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
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import ToolState
    from agents.tool_node import tool_node

    metadata = state.get("metadata", {})
    workflow_node = metadata.get("workflow_node")
    book_id = state.get("book_id")

    if not workflow_node:
        return {
            "step_outputs": {"step_tool": "错误：缺少 workflow_node 配置"},
            "executed_steps": ["step_tool"]
        }

    payload = {
        "query": state.get("input_summary", ""),
        "project_id": book_id,
        "workflow_node": workflow_node,
        "model_config": state["model_config"],
        "tool_result": "",
        "_exec_meta": {
            "node_id": metadata.get("current_node_id", "unknown"),
            "node_label": metadata.get("current_node_label", "工具"),
        }
    }

    builder = StateGraph(ToolState)
    builder.add_node(metadata.get("current_node_id", "tool"), tool_node)
    builder.add_edge(START, metadata.get("current_node_id", "tool"))
    builder.add_edge(metadata.get("current_node_id", "tool"), END)
    tool_graph = builder.compile()

    result = await tool_graph.ainvoke(payload)
    return {
        "step_outputs": {"step_tool": result.get("tool_result", "")},
        "executed_steps": ["step_tool"]
    }


async def call_main(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import MainState
    from agents.main_node import main_node

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt", "")
    context = metadata.get("current_context", {})
    workflow_node = metadata.get("workflow_node") or {}
    fields = workflow_node.get("context_fields") or [
        "input_worldview",
        "input_characters",
        "input_recent_chapters",
        "input_outline",
    ]

    payload = _build_context_payload(state, fields)
    payload["system_prompt"] = system_prompt
    payload["input_context"] = context
    payload["output"] = ""
    payload["_exec_meta"] = {
        "node_id": metadata.get("current_node_id", "unknown"),
        "node_label": metadata.get("current_node_label", "主节点"),
    }

    builder = StateGraph(MainState)
    builder.add_node(node_id or "main", main_node)
    builder.add_edge(START, node_id or "main")
    builder.add_edge(node_id or "main", END)
    main_graph = builder.compile()

    result = await main_graph.ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def call_compression(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import AuditState
    from agents.audit_node import audit_node

    meta = state.get("metadata", {})
    compress_text = meta.get("compress_text", "")
    source_id = meta.get("compress_source_id", "unknown")
    node_id = f"{source_id}_compressed"
    compression_prompt = "请压缩以下长文本,保留关键情节和核心信息,上下文需要逻辑连贯。"

    payload = _build_context_payload(state, ["input_worldview"])
    payload["system_prompt"] = compression_prompt
    payload["input_context"] = {"text": compress_text}
    payload["output"] = ""
    payload["_exec_meta"] = {
        "node_id": "__compress__",
        "node_label": "压缩中",
    }

    builder = StateGraph(AuditState)
    builder.add_node(node_id, audit_node)
    builder.add_edge(START, node_id)
    builder.add_edge(node_id, END)
    audit_graph = builder.compile()

    result = await audit_graph.ainvoke(payload)
    return {
        "step_outputs": {node_id: result["output"]},
        "executed_steps": ["__compress__"],
    }


async def call_audit(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import AuditState
    from agents.audit_node import audit_node

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt")
    context = state.get("step_outputs", {})
    workflow_node = metadata.get("workflow_node") or {}
    fields = workflow_node.get("context_fields") or [
        "input_worldview",
        "input_characters",
        "input_brief_summary",
        "input_recent_chapters",
        "input_outline",
    ]

    payload = _build_context_payload(state, fields)
    payload["system_prompt"] = system_prompt
    payload["input_context"] = context
    payload["output"] = ""
    payload["_exec_meta"] = {
        "node_id": metadata.get("current_node_id", "unknown"),
        "node_label": metadata.get("current_node_label", "审计"),
    }

    builder = StateGraph(AuditState)
    builder.add_node(node_id or "audit", audit_node)
    builder.add_edge(START, node_id or "audit")
    builder.add_edge(node_id or "audit", END)
    audit_graph = builder.compile()

    result = await audit_graph.ainvoke(payload)
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def route_after_manager(
    state: ParentState,
) -> Literal[
    "call_tool", "call_main", "call_compression", "call_audit", END  # type: ignore
]:
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
