"""supervisor / guardrail / chat / 子图路由测试（阶段二）。

覆盖：
- supervisor_node：新用户消息 → LLM 分类写入 subgraph；非用户消息回合不分类（防对 ToolMessage 瞎分类）；
  resume_from_subgraph 优先；分类失败默认 chat
- _extract_route：JSON 解析 / 关键词兜底 / 非法回 chat
- supervisor_router（嵌套子图版）：candidate_reply_ready / pending_review → END；
  已审批工具与排队工作流经 resume_from_subgraph 回子图由入口路由处理；有子图→回子图、chat→chat、无上下文→END
- guardrail_node：空消息 / 超长消息拦截，正常放行
- quality_gate_router：按子图放宽并行阈值（drafting 8 轮 / 默认 4 轮）
- build_user_agent_graph：嵌套拓扑可正常编译（父图 = guardrail/supervisor/chat/4 子图/sync，
  tool_calls/quality_gate/workflow_runner/compress 收进子图内部）
"""

from __future__ import annotations

import pytest

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END

from domains.agent import agent_nodes
from domains.agent.agent_nodes import (
    _extract_route,
    guardrail_node,
    quality_gate_router,
    supervisor_node,
    supervisor_router,
)
from domains.agent.graphs.agent_graph import build_user_agent_graph


def tool_msg(content: str = '{"ok": true}', name: str = "get_book_context", n: int = 1) -> ToolMessage:
    return ToolMessage(content=content, name=name, tool_call_id=f"t{n}")


def base_state(**kw) -> dict:
    state = {
        "messages": [],
        "pending_review": None,
        "pending_tool": None,
        "pending_workflow": None,
        "candidate_reply_ready": False,
        "subgraph": None,
        "resume_from_subgraph": None,
        "model_config": {},
    }
    state.update(kw)
    return state


# ---------------------------------------------------------------------------
# _extract_route
# ---------------------------------------------------------------------------


def test_extract_route_parses_json():
    assert _extract_route('好的 {"route": "drafting", "reason": "写正文"}') == "drafting"


def test_extract_route_keyword_fallback():
    assert _extract_route("用户想要完善角色设定 worldbuilding") == "worldbuilding"


def test_extract_route_chinese_keyword_fallback():
    # 非 JSON 中文回复（未带英文子图名）也能命中，不再一律掉进 chat
    assert _extract_route("用户想查询书籍信息") == "outlining"
    assert _extract_route("帮我搜一下写作素材") == "drafting"
    assert _extract_route("完善角色设定") == "worldbuilding"
    assert _extract_route("帮我查查这本小说有没有一致性问题") == "revising"


def test_extract_route_invalid_falls_back_chat():
    assert _extract_route("随便聊聊") == "chat"
    assert _extract_route("") == "chat"
    assert _extract_route('{"route": "unknown"}') == "chat"


def test_extract_route_low_confidence_falls_back_chat():
    # confidence < 0.5 时即使 route 合法也回 chat
    assert _extract_route('{"route": "drafting", "confidence": 0.2, "reason": "不确定"}') == "chat"
    assert _extract_route('{"route": "drafting", "confidence": 0.49, "reason": "边缘"}') == "chat"


def test_extract_route_high_confidence_keeps_route():
    assert _extract_route('{"route": "drafting", "confidence": 0.9, "reason": "写正文"}') == "drafting"
    # 无 confidence 字段：缺省视为高置信（兼容旧模型输出）
    assert _extract_route('{"route": "worldbuilding", "reason": "设定"}') == "worldbuilding"


# ---------------------------------------------------------------------------
# supervisor_node
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_supervisor_classifies_new_user_message(monkeypatch):
    def _fake_model(config):
        class _R:
            content = '{"route": "drafting", "reason": "写第一章"}'

        class _M:
            async def ainvoke(self, msgs):
                return _R()

        class _F:
            main = _M()

        return _F()

    monkeypatch.setattr(agent_nodes, "ModelFactory", _fake_model)
    state = base_state(messages=[HumanMessage(content="帮我写第一章")])
    result = await supervisor_node(state)
    assert result["subgraph"] == "drafting"
    assert result["turn_metrics"] == {"llm_calls": 1}


@pytest.mark.asyncio
async def test_supervisor_skips_non_user_message_turn():
    state = base_state(messages=[HumanMessage(content="hi"), AIMessage(content="你好"), tool_msg()])
    result = await supervisor_node(state)
    assert result == {}


@pytest.mark.asyncio
async def test_supervisor_honors_resume_from_subgraph():
    state = base_state(messages=[HumanMessage(content="继续")], resume_from_subgraph="outlining")
    result = await supervisor_node(state)
    assert result == {"subgraph": "outlining"}


@pytest.mark.asyncio
async def test_supervisor_defaults_chat_on_classify_failure(monkeypatch):
    async def _boom(self, msgs):
        raise RuntimeError("LLM 不可用")

    monkeypatch.setattr(
        agent_nodes,
        "ModelFactory",
        lambda config: type("F", (), {"main": type("M", (), {"ainvoke": _boom})()})(),
    )
    state = base_state(messages=[HumanMessage(content="随便说点")])
    result = await supervisor_node(state)
    assert result["subgraph"] == "chat"
    assert result["turn_metrics"] == {"llm_calls": 1}


# ---------------------------------------------------------------------------
# supervisor_router
# ---------------------------------------------------------------------------


def test_supervisor_router_routes_approved_tool_back_to_subgraph():
    # 嵌套子图版：已审批写工具不再直达父层 tool_calls（节点已收进子图），
    # 回子图后由 subgraph_entry_router 承接执行
    state = base_state(
        pending_tool={"queue": [{"tool_name": "build_outline", "tool_args": {}}], "decision": "accept"},
        subgraph="outlining",
    )
    assert supervisor_router(state) == "outlining"


def test_supervisor_router_routes_pending_workflow_back_to_subgraph():
    state = base_state(pending_workflow={"workflow_id": "wf-1"}, subgraph="drafting")
    assert supervisor_router(state) == "drafting"


def test_supervisor_router_ends_on_pending_review():
    state = base_state(pending_review={"node_id": "x"})
    assert supervisor_router(state) == END


def test_supervisor_router_ends_on_candidate_ready():
    state = base_state(candidate_reply_ready=True, subgraph="drafting")
    assert supervisor_router(state) == END


def test_supervisor_router_returns_subgraph():
    state = base_state(subgraph="drafting")
    assert supervisor_router(state) == "drafting"


def test_supervisor_router_returns_chat():
    state = base_state(subgraph="chat")
    assert supervisor_router(state) == "chat"


def test_supervisor_router_ends_without_context():
    assert supervisor_router(base_state()) == END


# ---------------------------------------------------------------------------
# guardrail_node
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guardrail_empty_message_intercepted():
    result = await guardrail_node(base_state(messages=[HumanMessage(content="   ")]))
    assert result["messages"][0].content == "消息不能为空，请输入你想让 Agent 帮你做的事。"


@pytest.mark.asyncio
async def test_guardrail_long_message_intercepted():
    result = await guardrail_node(base_state(messages=[HumanMessage(content="长" * 7000)]))
    assert "消息过长" in result["messages"][0].content


@pytest.mark.asyncio
async def test_guardrail_allows_normal_message():
    assert await guardrail_node(base_state(messages=[HumanMessage(content="写一章")])) == {}


@pytest.mark.asyncio
async def test_guardrail_noop_on_resume_turn():
    assert await guardrail_node(base_state(messages=[AIMessage(content="已执行"), tool_msg()])) == {}


# ---------------------------------------------------------------------------
# quality_gate_router 按子图放宽阈值
# ---------------------------------------------------------------------------


def test_quality_gate_default_ends_at_4_tool_rounds():
    state = base_state(
        subgraph="outlining",
        messages=[tool_msg(n=i) for i in range(4)],
    )
    assert quality_gate_router(state) == END


def test_quality_gate_drafting_allows_more_parallel_tool_rounds():
    state = base_state(
        subgraph="drafting",
        messages=[tool_msg(n=i) for i in range(6)],
    )
    assert quality_gate_router(state) == "supervisor"


def test_quality_gate_drafting_still_ends_at_8():
    state = base_state(
        subgraph="drafting",
        messages=[tool_msg(n=i) for i in range(8)],
    )
    assert quality_gate_router(state) == END


def test_quality_gate_pending_review_ends():
    state = base_state(pending_review={"node_id": "x"}, messages=[tool_msg()])
    assert quality_gate_router(state) == END


def test_quality_gate_pending_workflow_routes_workflow_runner():
    state = base_state(pending_workflow={"workflow_id": "wf-1"}, messages=[tool_msg()])
    assert quality_gate_router(state) == "workflow_runner"


# ---------------------------------------------------------------------------
# 图编译
# ---------------------------------------------------------------------------


def test_graph_compiles_with_supervisor_topology():
    from shared.database import db_manager

    graph = build_user_agent_graph(db_manager.with_db, model_config={"base_url": "x", "model_id": "y"})
    nodes = set(graph.get_graph().nodes.keys())
    # 嵌套子图版：父图只保留 护栏/supervisor/chat/4 子图/sync；
    # tool_calls/workflow_runner/compress 已收进各子图内部
    assert {"guardrail", "supervisor", "chat", "worldbuilding", "outlining", "drafting", "revising",
            "sync"} <= nodes
    assert not ({"tool_calls", "workflow_runner", "compress"} <= nodes)
    subgraphs = dict(graph.get_subgraphs())
    assert set(subgraphs) == {"worldbuilding", "outlining", "drafting", "revising"}
    for name, sub in subgraphs.items():
        sub_nodes = set(sub.get_graph().nodes.keys())
        assert {"final"} <= sub_nodes
        assert {"tool_calls", "workflow_runner", "compress"} <= sub_nodes
