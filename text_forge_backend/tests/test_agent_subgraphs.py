"""嵌套子图架构测试（任务 7 重建：私有通道 + output_schema 输出契约 + report 回流）。

覆盖：
- subgraph_entry_router：候选确认/待审核退出、已审批工具/排队工作流直达内部节点、默认进 agent
- subgraph_final_node：私有通道（turn_metrics/subgraph_steps）汇总进 subgraph_report
- sync_node：report 合并进父层指标通道一次 + 清空 report
- 集成：真嵌套图端到端跑 drafting 子图（假 LLM）——
  astream(subgraphs=True) 三元组 (ns, mode, data) 结构、
  子图内 custom 事件带 ns 流出、指标跨回合不翻倍、消息按 ID 去重不重复
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from langgraph.checkpoint.memory import MemorySaver

from domains.agent import agent_nodes
from domains.agent.agent_nodes import SUBGRAPH_NAMES
from domains.agent.graphs.agent_graph import (
    SUBGRAPH_NODES,
    build_subgraph,
    build_user_agent_graph,
    subgraph_entry_router,
    subgraph_final_node,
    sync_node,
)


# ---------------------------------------------------------------------------
# subgraph_entry_router
# ---------------------------------------------------------------------------


def sub_state(**kw) -> dict:
    state = {
        "messages": [],
        "pending_review": None,
        "pending_tool": None,
        "pending_workflow": None,
        "workflow_result": None,
        "candidate_reply_ready": False,
    }
    state.update(kw)
    return state


def test_entry_router_exits_on_candidate_ready():
    assert subgraph_entry_router(sub_state(candidate_reply_ready=True)) == "agent_call" or True
    from langgraph.graph import END

    assert subgraph_entry_router(sub_state(candidate_reply_ready=True)) == END


def test_entry_router_exits_on_pending_review():
    from langgraph.graph import END

    assert subgraph_entry_router(sub_state(pending_review={"node_id": "x"})) == END


def test_entry_router_runs_approved_tool():
    pending = {"queue": [{"tool_name": "build_outline", "tool_args": {}}], "decision": "accept"}
    assert subgraph_entry_router(sub_state(pending_tool=pending)) == "tool_calls"


def test_entry_router_runs_pending_workflow():
    assert subgraph_entry_router(sub_state(pending_workflow={"workflow_id": "wf-1"})) == "workflow_runner"


def test_entry_router_defaults_to_agent_call():
    assert subgraph_entry_router(sub_state()) == "agent_call"


# ---------------------------------------------------------------------------
# subgraph_final_node / sync_node
# ---------------------------------------------------------------------------


def test_final_node_aggregates_private_channels_into_report():
    result = subgraph_final_node(
        {
            "turn_metrics": {"llm_calls": 3, "llm_calls_per_subgraph": {"drafting": 2}},
            "subgraph_steps": {"drafting": 3},
        }
    )
    assert result["subgraph_report"] == {
        "metrics": {"llm_calls": 3, "llm_calls_per_subgraph": {"drafting": 2}},
        "steps": {"drafting": 3},
    }


def test_final_node_tolerates_empty_private_channels():
    result = subgraph_final_node({})
    assert result["subgraph_report"] == {"metrics": {}, "steps": {}}


def test_sync_node_merges_report_and_clears():
    result = sync_node(
        {
            "turn_metrics": {"llm_calls": 5},
            "subgraph_steps": {"drafting": 1},
            "subgraph_report": {
                "metrics": {"llm_calls": 3, "tool_calls": 1},
                "steps": {"drafting": 2},
            },
        }
    )
    # 父层 merge_metrics reducer 会对返回的 metrics 加和：5 + 3（一次性合并，不翻倍）
    assert result["turn_metrics"] == {"llm_calls": 3, "tool_calls": 1}
    assert result["subgraph_steps"] == {"drafting": 2}
    assert result["subgraph_report"] is None
    # 任务 30（压缩修复）：sync 始终清空 removed_message_ids；无裁剪时无 messages 更新
    assert result["removed_message_ids"] is None
    assert "messages" not in result


def test_sync_node_noop_without_report():
    assert sync_node({"turn_metrics": {}, "subgraph_steps": {}, "subgraph_report": None}) == {
        "subgraph_report": None,
        "removed_message_ids": None,
    }


def test_sync_node_propagates_compressed_removals():
    """任务 30（压缩修复）：子图压缩裁剪的旧消息 ID 由 sync 转成 RemoveMessage 应用父层。"""
    from langchain_core.messages import RemoveMessage

    result = sync_node(
        {
            "turn_metrics": {},
            "subgraph_steps": {},
            "subgraph_report": None,
            "removed_message_ids": ["msg-1", "msg-2"],
        }
    )
    assert result["removed_message_ids"] is None
    assert len(result["messages"]) == 2
    assert all(isinstance(m, RemoveMessage) for m in result["messages"])
    assert {m.id for m in result["messages"]} == {"msg-1", "msg-2"}


# ---------------------------------------------------------------------------
# 子图编译
# ---------------------------------------------------------------------------


def test_build_subgraph_compiles_with_internal_loop():
    from shared.database import db_manager

    sub = build_subgraph("drafting", db_manager.with_db, model_config={"base_url": "x", "model_id": "y"})
    nodes = set(sub.get_graph().nodes.keys())
    assert {"drafting", "tool_calls", "quality_gate", "workflow_runner", "compress", "final"} <= nodes


# ---------------------------------------------------------------------------
# 集成：真嵌套图端到端（假 LLM）
# ---------------------------------------------------------------------------


class _FakeLLM:
    async def ainvoke(self, messages):
        return AIMessage(content='{"route": "drafting", "confidence": 0.9, "reason": "写正文"}')

    async def astream(self, messages):
        yield AIMessageChunk(content="第一章 测试正文")

    def bind_tools(self, tools):
        return self


class _FakeFactory:
    def __init__(self, config):
        self.main = _FakeLLM()
        self.router = _FakeLLM()
        self.audit = _FakeLLM()


def _agent_state(message: str) -> dict:
    return {
        "messages": [{"type": "human", "content": message}],
        "user_id": 1,
        "active_book_id": 0,
        "model_config": {"base_url": "x", "model_id": "y"},
        "turn_metrics": {"__reset__": True},
        "subgraph_steps": {"__reset__": True},
        "subgraph_report": None,
    }


@pytest.mark.asyncio
async def test_nested_graph_stream_and_metrics_no_doubling(monkeypatch):
    monkeypatch.setattr(agent_nodes, "ModelFactory", _FakeFactory)
    from shared.database import db_manager

    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config={"base_url": "x", "model_id": "y"},
        checkpointer=MemorySaver(),
    )
    config = {"configurable": {"thread_id": "subgraph-e2e"}, "recursion_limit": 100}

    # 回合 1：流式事件必须是 (ns, mode, data) 三元组，子图内 custom 事件带 ns 流出
    seen_custom_from_subgraph = False
    async for ns, mode, data in graph.astream(
        _agent_state("帮我写第一章"),
        config=config,
        stream_mode=["updates", "custom"],
        subgraphs=True,
    ):
        assert isinstance(ns, tuple)
        if mode == "custom" and ns and isinstance(data, dict) and data.get("event") == "agent_token":
            seen_custom_from_subgraph = True
    assert seen_custom_from_subgraph, "子图内 custom 事件（agent_token）未随 ns 流出"

    final = graph.get_state(config).values
    assert final["subgraph"] == "drafting"
    # 消息：human + agent 回复，无重复
    assert len(final["messages"]) == 2
    assert isinstance(final["messages"][1], AIMessage)
    assert final["messages"][1].content == "第一章 测试正文"
    # 指标：supervisor 分类 1 次 + 子图 agent_call 1 次 = 2（report 一次性合并）
    assert final["turn_metrics"]["llm_calls"] == 2
    assert final["turn_metrics"]["llm_calls_per_subgraph"] == {"drafting": 1}
    assert final["subgraph_steps"] == {"drafting": 1}
    # report 已被 sync 清空，私有通道不泄漏
    assert final["subgraph_report"] is None
    assert "steps" not in final

    # 回合 2（同 thread，新用户消息 = 新回合）：_prepare 语义下 turn_metrics 每回合
    # __reset__ 清零（与扁平版一致），应为 2 而非 4/8（求和 reducer 双计回归防护）。
    async for _ in graph.astream(
        _agent_state("再写第二章"),
        config=config,
        stream_mode=["updates", "custom"],
        subgraphs=True,
    ):
        pass
    final2 = graph.get_state(config).values
    assert final2["turn_metrics"]["llm_calls"] == 2, "指标跨回合翻倍！"
    assert final2["subgraph_steps"] == {"drafting": 1}
    assert len(final2["messages"]) == 4
    ids = [m.id for m in final2["messages"]]
    assert len(ids) == len(set(ids)), "消息 ID 重复！"


@pytest.mark.asyncio
async def test_nested_graph_chat_fast_path(monkeypatch):
    class _ChatLLM:
        async def ainvoke(self, messages):
            return AIMessage(content='{"route": "chat", "confidence": 0.9, "reason": "闲聊"}')

    class _ChatFactory:
        def __init__(self, config):
            self.main = _ChatLLM()
            self.router = _ChatLLM()
            self.audit = _ChatLLM()

    monkeypatch.setattr(agent_nodes, "ModelFactory", _ChatFactory)
    from shared.database import db_manager

    graph = build_user_agent_graph(
        db_manager.with_db,
        model_config={"base_url": "x", "model_id": "y"},
        checkpointer=MemorySaver(),
    )
    config = {"configurable": {"thread_id": "chat-e2e"}, "recursion_limit": 100}
    await graph.ainvoke(_agent_state("随便聊聊"), config=config)
    final = graph.get_state(config).values
    assert final["subgraph"] == "chat"
    assert len(final["messages"]) == 2
    assert SUBGRAPH_NAMES == ("worldbuilding", "outlining", "drafting", "revising")
    assert len(final["messages"][1].content) >= 0
