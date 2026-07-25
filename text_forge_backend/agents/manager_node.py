import json
from typing import Literal
from langgraph.graph import END
from agents.state import ParentState
from infrastructure.graph_lifecycle import graph_register


async def manager_node(state: ParentState):
    nodes = state["workflow_nodes"]
    outputs = state.get("step_outputs", {})
    executed_set = set(state.get("executed_steps", []))

    if "n_writer" in executed_set and "n_audit" not in executed_set:
        writer_output = outputs.get("n_writer", "")
        if len(str(writer_output)) > 8000:
            return {
                "next_step_id": "step_compression_forced",
                "metadata": {"compressed": True},
            }
    next_node = None
    for node in nodes:
        node_id = node["id"]
        if node_id in executed_set:
            continue
        deps = node.get("depends_on", [])
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
    for dep in next_node.get("depends_on", []):
        if dep in outputs:
            context[dep] = outputs[dep]

    router_input = {
        "task_lable": next_node["label"],
        "task_prompt": next_node["system_prompt"],
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
    tool_graph = graph_register.get_compiled("tool")
    result = await tool_graph.ainvoke({"query": state["input_messages"]})
    return {
        "step_outputs": {"step_tool": result["tool_result"]},
        "executed_steps": ["step_tool"],
    }


async def call_main(state: ParentState) -> dict:
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
            tool_result = await tool_graph.ainvoke({"query": state["input_messages"]})
            context["tool_result"] = tool_result["tool_result"]
    main_graph = graph_register.get_compiled("main")
    result = await main_graph.ainvoke(
        {"system_prompt": system_prompt, "input_context": context, "output": ""}
    )
    return {"step_outputs": {node_id: result["output"]}, "executed_steps": [node_id]}


async def call_compression(state: ParentState) -> dict:
    writer_text = state["step_outputs"].get("n_writer", "")
    compression_prompt = "请压缩以下长文本,保留关键情节和核心信息,上下文需要逻辑连贯。"
    audit_graph = graph_register.get_compiled("audit")
    result = await audit_graph.ainvoke(
        {
            "system_prompt": compression_prompt,
            "input_context": {"text": writer_text},
            "output": "",
        }
    )
    return {
        "step_outputs": {"step_compressed": result["output"]},
        "executed_step": ["step_compression_forced"],
    }


async def call_audit(state: ParentState) -> dict:
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
        {"system_prompt": system_prompt, "input_context": context, "output": ""}
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

    # 强制压缩走特殊分支
    if next_id == "step_compression_forced":
        print("[路由] 压缩任务 -> Audit 子图")
        return "call_compression"

    # 从 metadata 读取 Router 的决策
    target_executor = state.get("metadata", {}).get("target_executor", "main")

    # 物理映射（基础设施层固定）
    executor_to_node = {
        "main": "call_main",
        "audit": "call_audit",
        "tool": "call_tool",
    }
    target_node = executor_to_node.get(target_executor, "call_main")
    print(f"[路由] {target_executor} -> {target_node}")
    return target_node
