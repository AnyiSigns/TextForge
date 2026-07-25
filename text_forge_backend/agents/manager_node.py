import json
from typing import Literal
from langgraph.graph import END
from agents.state import ParentState


def _to_serializable(value):
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


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

    tool_graph = graph_register.get_compiled("tool")
    result = await tool_graph.ainvoke(
        {
            "query": state["input_messages"],
            "model_config": state["model_config"],
        }
    )
    return {
        "step_outputs": {"step_tool": result["tool_result"]},
        "executed_steps": ["step_tool"],
    }


async def call_main(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt", "")
    context = metadata.get("current_context", {})
    tool_ids = metadata.get("current_tool_ids", [])

    print(f"调用main子图,执行节点{node_id}")
    if tool_ids:
        print(f"挂载工具{tool_ids}")
        if "step_tool" not in state.get("executed_steps", []):
            tool_graph = graph_register.get_compiled("tool")
            tool_result = await tool_graph.ainvoke(
                {
                    "query": state["input_messages"],
                    "model_config": state["model_config"],
                }
            )
            context["tool_result"] = tool_result["tool_result"]
    main_graph = graph_register.get_compiled("main")
    result = await main_graph.ainvoke(
        {
            "system_prompt": system_prompt,
            "input_context": context,
            "output": "",
            "model_config": state["model_config"],
        }
    )
    print(f"main子图返回: output={result.get('output')!r}")
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def call_compression(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register

    meta = state.get("metadata", {})
    compress_text = meta.get("compress_text", "")
    source_id = meta.get("compress_source_id", "unknown")
    compression_prompt = "请压缩以下长文本,保留关键情节和核心信息,上下文需要逻辑连贯。"
    audit_graph = graph_register.get_compiled("audit")
    result = await audit_graph.ainvoke(
        {
            "system_prompt": compression_prompt,
            "input_context": {"text": compress_text},
            "output": "",
            "model_config": state["model_config"],
        }
    )
    compressed = result["output"]
    print(f"[压缩] 完成，{len(compress_text)} -> {len(compressed)} 字符")
    return {
        "step_outputs": {f"{source_id}_compressed": compressed},
        "executed_steps": ["__compress__"],
    }


async def call_audit(state: ParentState) -> dict:
    from infrastructure.graph_lifecycle import graph_register

    metadata = state.get("metadata", {})
    node_id = metadata.get("current_node_id")
    system_prompt = metadata.get("current_system_prompt")
    context = metadata.get("current_context", {})

    compressed = state["step_outputs"].get("step_compressed")
    if compressed:
        context["compressed_text"] = compressed

    print(f"Audit：执行节点：{node_id}")
    audit_graph = graph_register.get_compiled("audit")
    result = await audit_graph.ainvoke(
        {
            "system_prompt": system_prompt,
            "input_context": context,
            "output": "",
            "model_config": state["model_config"],
        }
    )
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
