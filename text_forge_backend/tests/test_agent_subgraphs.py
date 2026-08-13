"""嵌套子图架构测试（重建：私有通道 + output_schema 输出契约 + report 回流）。

覆盖：
- subgraph_entry_router：候选确认/待审核退出、已审批工具/排队工作流直达内部节点、默认进 agent
- subgraph_final_node：私有通道（turn_metrics/subgraph_steps）汇总进 subgraph_report
- sync_node：report 合并进父层指标通道一次 + 清空 report
- 集成：真嵌套图端到端跑 drafting 子图（假 LLM）——
  astream(subgraphs=True) 三元组 (ns, mode, data) 结构、
  子图内 custom 事件带 ns 流出、指标跨回合不翻倍、消息按 ID 去重不重复
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk
from langgraph.checkpoint.memory import MemorySaver

from domains.agent import agent_nodes
from domains.agent.agent_nodes import SUBGRAPH_NAMES
from domains.agent.graphs.agent_graph import (
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
    # sync 始终清空 removed_message_ids；无裁剪时无 messages 更新
    assert result["removed_message_ids"] is None
    assert "messages" not in result


def test_sync_node_noop_without_report():
    assert sync_node({"turn_metrics": {}, "subgraph_steps": {}, "subgraph_report": None}) == {
        "subgraph_report": None,
        "removed_message_ids": None,
    }


def test_sync_node_propagates_compressed_removals():
    """子图压缩裁剪的旧消息 ID 由 sync 转成 RemoveMessage 应用父层。"""
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
    assert {"drafting", "tool_calls", "workflow_runner", "compress", "final"} <= nodes


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
    assert isinstance(final["messages"][1].content, str) and len(final["messages"][1].content) > 0


# ---------------------------------------------------------------------------
# B1 回归：stream_agent 的 event_generator 必须正确解包 (ns, mode, data)，
# 否则在 custom 分支引用未定义变量 mode/data 抛 NameError（整条 SSE 流崩溃）。
# ---------------------------------------------------------------------------


class _FakeRequest:
    async def is_disconnected(self):
        return False


class _FakeSession:
    def add(self, obj):
        pass

    async def commit(self):
        pass


class _FakeTool:
    async def ainvoke(self, *args, **kwargs):
        return None


class _FakeGraph:
    async def astream(self, state, config=None, stream_mode=None, subgraphs=False):
        # 一条 custom 的 agent_token 事件：验证 event_generator 解包 (ns, mode, data)
        yield ((), "custom", {"event": "agent_token", "token": "hi"})


def _fake_build_user_agent_graph(*args, **kwargs):
    return _FakeGraph()


async def _fake_prepare_agent_state(*args, **kwargs):
    # title 非「新对话」→ 跳过 _generate_title 的真实 LLM 调用
    conv = SimpleNamespace(title="已有标题", id=1)
    state = {"messages": [], "subgraph": None}
    return conv, state, 0, "", ""


async def _noop_async(*args, **kwargs):
    return None


@pytest.mark.asyncio
async def test_stream_agent_sse_emits_event_without_nameerror(monkeypatch):
    """B1 回归：stream_agent 必须产出自旋 SSE 事件且不抛 NameError。

    通过 mock build_user_agent_graph 产出单条 (ns, mode, data) 三元组，
    真实执行 event_generator 的 custom 事件消费路径（line 479 解包）：
    断言流至少产出一个事件、且包含 agent_token 自定义事件。
    """
    from domains.agent import streaming as streaming_mod
    from domains.agent.tools import feedback_tools
    from schema.request.common import ChatRequest

    monkeypatch.setattr(streaming_mod, "build_user_agent_graph", _fake_build_user_agent_graph)
    monkeypatch.setattr(
        streaming_mod,
        "_acquire_thread_lock",
        lambda tid: asyncio.sleep(0, result=(True, "k", "h")),
    )
    monkeypatch.setattr(streaming_mod, "_prepare_agent_state", _fake_prepare_agent_state)
    monkeypatch.setattr(streaming_mod, "_renew_book_lock", _noop_async)
    monkeypatch.setattr(streaming_mod, "_strip_api_key_from_checkpoint", _noop_async)
    monkeypatch.setattr(streaming_mod, "_release_book_lock", _noop_async)
    monkeypatch.setattr(streaming_mod, "_release_thread_lock", _noop_async)
    monkeypatch.setattr(streaming_mod, "_auto_digest_if_due", _noop_async)
    monkeypatch.setattr(
        feedback_tools,
        "_build_feedback_tools",
        lambda *a, **k: {"proactive_suggestions": _FakeTool()},
    )

    body = ChatRequest(
        thread_id="b1-regression",
        message="hi",
        model_config_data={"main_config": {"model_id": "x"}},
    )
    resp = await streaming_mod.stream_agent(
        user_id=1,
        thread_id="b1-regression",
        body=body,
        request=_FakeRequest(),
        session=_FakeSession(),
        _rl=None,
    )
    chunks = []
    async for chunk in resp.body_iterator:
        chunks.append(chunk)

    assert chunks, "stream_agent 未产出任何 SSE 事件"
    joined = "".join(chunks)
    assert "agent_token" in joined, "未产出 agent_token 自定义事件"
    assert "hi" in joined, "agent_token 事件未携带真实 token 内容"
