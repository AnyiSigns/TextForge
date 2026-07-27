import json
from typing import Literal
from agents.state import ParentState
from langgraph.graph import END, START, StateGraph


def _to_serializable(value):
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


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


async def manager_node(state: ParentState):
    from infrastructure.graph_lifecycle import graph_register

    nodes = state["workflow_nodes"]
    outputs = state.get("step_outputs", {})
    executed_set = set(state.get("executed_steps", []))

    next_node = None
    for node in nodes:
        node_id = node["id"]
        if node_id in executed_set:
            continue
        deps = node.get("depends_on") or []
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

    context = {}
    for dep in next_node.get("depends_on") or []:
        if dep in outputs:
            context[dep] = _to_serializable(outputs[dep])

    upstream_text = ""
    upstream_id = None
    for dep in next_node.get("depends_on") or []:
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
                "current_system_prompt": next_node["system_prompt"],
                "current_context": context,
                "current_tool_ids": next_node.get("tool_ids", []),
                "compress_source_id": upstream_id,
                "compress_text": upstream_text,
            },
        }

    router_input = {
        "task_label": next_node["label"],
        "task_prompt": next_node["system_prompt"],
        "model_config": state["model_config"],
    }
    router_graph = graph_register.get_compiled("router")
    router_result = await router_graph.ainvoke(router_input)
    try:
        decision = json.loads(router_result["decision"])
        target_executor = decision.get("executor", "main")

    except:
        target_executor = "main"
    print(f"[Manager]:使用执行器{target_executor}")

    return {
        "next_step_id": next_node["id"],
        "metadata": {
            "current_node_id": next_node["id"],
            "current_system_prompt": next_node["system_prompt"],
            "current_context": context,
            "target_executor": target_executor,
            "current_tool_ids": next_node.get("tool_ids", []),
        },
    }


async def call_tool(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import ToolState
    from agents.tool_node import tool_node

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id", "step_tool")
    workflow_node = next(
        (n for n in state.get("workflow_nodes", []) if n["id"] == node_id), {}
    )
    fields = workflow_node.get("contextFields") or ["input_summary"]

    builder = StateGraph(ToolState)
    builder.add_node(node_id, tool_node)
    builder.add_edge(START, node_id)
    builder.add_edge(node_id, END)
    tool_graph = builder.compile()

    payload = _build_context_payload(state, fields)
    payload["query"] = state["input_summary"]
    result = await tool_graph.ainvoke(payload)
    return {
        "step_outputs": {"step_tool": result["tool_result"]},
        "executed_steps": ["step_tool"],
    }


async def call_main(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register
    from agents.state import MainState
    from agents.main_node import main_node

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt", "")
    context = metadata.get("current_context", {})
    tool_ids = metadata.get("current_tool_ids", [])
    workflow_node = next(
        (n for n in state.get("workflow_nodes", []) if n["id"] == node_id), {}
    )
    fields = workflow_node.get("contextFields") or [
        "input_worldview",
        "input_characters",
        "input_recent_chapters",
        "input_outline",
    ]

    print(f"调用main子图,执行节点{node_id}")
    if tool_ids:
        print(f"挂载工具{tool_ids}")
        if "step_tool" not in state.get("executed_steps", []):
            tool_graph = graph_register.get_compiled("tool")
            tool_payload = _build_context_payload(state, ["input_summary"])
            tool_payload["query"] = state["input_summary"]
            tool_result = await tool_graph.ainvoke(tool_payload)
            context["tool_result"] = tool_result["tool_result"]

    builder = StateGraph(MainState)
    builder.add_node(node_id or "main", main_node)
    builder.add_edge(START, node_id or "main")
    builder.add_edge(node_id or "main", END)
    main_graph = builder.compile()

    payload = _build_context_payload(state, fields)
    payload["system_prompt"] = system_prompt
    payload["input_context"] = context
    payload["output"] = ""
    result = await main_graph.ainvoke(payload)
    print(f"main子图返回: output={result.get('output')!r}")
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

    builder = StateGraph(AuditState)
    builder.add_node(node_id, audit_node)
    builder.add_edge(START, node_id)
    builder.add_edge(node_id, END)
    audit_graph = builder.compile()

    payload = _build_context_payload(state, ["input_worldview"])
    payload["system_prompt"] = compression_prompt
    payload["input_context"] = {"text": compress_text}
    payload["output"] = ""
    result = await audit_graph.ainvoke(payload)
    print(f"[压缩] 完成，{len(compress_text)} -> {len(result.get('output', ''))} 字符")
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
    workflow_node = next(
        (n for n in state.get("workflow_nodes", []) if n["id"] == node_id), {}
    )
    fields = workflow_node.get("contextFields") or [
        "input_worldview",
        "input_characters",
        "input_brief_summary",
        "input_recent_chapters",
        "input_outline",
    ]

    compressed = state["step_outputs"].get("step_compressed")
    if compressed:
        context["compressed_text"] = compressed

    print(f"Audit：执行节点：{node_id}")

    builder = StateGraph(AuditState)
    builder.add_node(node_id or "audit", audit_node)
    builder.add_edge(START, node_id or "audit")
    builder.add_edge(node_id or "audit", END)
    audit_graph = builder.compile()

    payload = _build_context_payload(state, fields)
    payload["system_prompt"] = system_prompt
    payload["input_context"] = context
    payload["output"] = ""
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
