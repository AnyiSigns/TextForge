"""任务 28 指标层 / 子图 step cap / 任务 29 写操作审计 测试。

覆盖：
- merge_metrics reducer：数值相加 / 嵌套 dict 合并 / __reset__ 重置
- agent_call / supervisor_node / chat_node / auto_compress_node 指标计数
- quality_gate_router 子图 step cap 终止
- build_turn_metrics_payload 汇总 duration_ms + 子图明细
- record_write_audit / persist_turn_metrics 落库（FakeSession）
"""

from __future__ import annotations

import time

import pytest

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.graph import END

from domains.agent import agent_nodes
from domains.agent.agent_nodes import (
    SUBGRAPH_STEP_CAPS,
    agent_call,
    chat_node,
    quality_gate_router,
)
from domains.agent.agent_state import merge_metrics
from domains.agent.metrics import build_turn_metrics_payload
from tests.conftest import FakeSession, FakeSessionFactory


# ---------------------------------------------------------------------------
# merge_metrics reducer
# ---------------------------------------------------------------------------


def test_merge_metrics_sums_numbers_and_merges_nested():
    acc = {"llm_calls": 1, "llm_calls_per_subgraph": {"drafting": 1}}
    acc = merge_metrics(acc, {"llm_calls": 2, "llm_calls_per_subgraph": {"drafting": 1}})
    assert acc == {"llm_calls": 3, "llm_calls_per_subgraph": {"drafting": 2}}


def test_merge_metrics_reset_marker():
    acc = {"llm_calls": 5}
    assert merge_metrics(acc, {"__reset__": True}) == {}


# ---------------------------------------------------------------------------
# agent_call 指标计数
# ---------------------------------------------------------------------------


class _FakeChunk:
    content = "第一章 测试正文"
    additional_kwargs = {}
    reasoning_content = ""


class _FakeStreamLLM:
    async def astream(self, messages):
        yield _FakeChunk()

    def bind_tools(self, tools):
        return self


class _FakeFactory:
    def __init__(self, config):
        self.main = _FakeStreamLLM()


@pytest.mark.asyncio
async def test_agent_call_counts_llm_and_subgraph_step(monkeypatch):
    monkeypatch.setattr(agent_nodes, "ModelFactory", _FakeFactory)

    state = {
        "model_config": {},
        "messages": [HumanMessage(content="写第一章")],
        "user_id": 1,
        "active_book_id": 2,
        "subgraph": "drafting",
        "turn_metrics": {},
        "subgraph_steps": {},
    }
    update = await agent_call(state, subgraph="drafting")
    assert update["turn_metrics"]["llm_calls"] == 1
    assert update["turn_metrics"]["llm_calls_per_subgraph"] == {"drafting": 1}
    assert update["turn_metrics"]["output_chars"] == len(_FakeChunk.content)
    assert update["subgraph_steps"] == {"drafting": 1}
    assert len(update["messages"]) == 1


# ---------------------------------------------------------------------------
# quality_gate_router 子图 step cap
# ---------------------------------------------------------------------------


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
        "turn_metrics": {},
        "subgraph_steps": {},
    }
    state.update(kw)
    return state


def test_step_cap_ends_when_subgraph_steps_exceed():
    cap = SUBGRAPH_STEP_CAPS["outlining"]
    state = base_state(
        subgraph="outlining",
        messages=[tool_msg(n=i) for i in range(3)],
        subgraph_steps={"outlining": cap},
    )
    assert quality_gate_router(state) == END


def test_step_cap_allows_below_limit():
    state = base_state(
        subgraph="drafting",
        messages=[tool_msg(n=i) for i in range(3)],
        subgraph_steps={"drafting": SUBGRAPH_STEP_CAPS["drafting"] - 1},
    )
    assert quality_gate_router(state) == "supervisor"


def test_step_cap_ignores_unknown_subgraph():
    state = base_state(subgraph=None, messages=[tool_msg()], subgraph_steps={"x": 999})
    assert quality_gate_router(state) == "supervisor"


# ---------------------------------------------------------------------------
# 每回合输出字符预算（任务 10 扩展）
# ---------------------------------------------------------------------------


def test_output_budget_ends_when_exceeded():
    from domains.agent.agent_nodes import TURN_OUTPUT_CHAR_BUDGET

    state = base_state(
        subgraph="drafting",
        messages=[tool_msg(n=i) for i in range(3)],
        turn_metrics={"output_chars": TURN_OUTPUT_CHAR_BUDGET},
    )
    assert quality_gate_router(state) == END


def test_output_budget_allows_below_limit():
    state = base_state(
        subgraph="drafting",
        messages=[tool_msg(n=i) for i in range(3)],
        turn_metrics={"output_chars": 1000},
    )
    assert quality_gate_router(state) == "supervisor"


def test_output_budget_merges_across_agent_calls():
    from domains.agent.agent_state import merge_metrics

    acc = merge_metrics({}, {"output_chars": 200})
    acc = merge_metrics(acc, {"output_chars": 300})
    assert acc == {"output_chars": 500}


# ---------------------------------------------------------------------------
# build_turn_metrics_payload
# ---------------------------------------------------------------------------


def test_build_payload_includes_duration_and_details():
    started = time.monotonic()
    final = {
        "subgraph": "drafting",
        "turn_metrics": {
            "llm_calls": 3,
            "llm_calls_per_subgraph": {"drafting": 2},
            "tool_calls": 4,
            "tool_success": 3,
            "tool_fail": 1,
            "compress_count": 1,
            "approval_count": 1,
            "approval_accept": 1,
        },
        "subgraph_steps": {"drafting": 3},
    }
    payload = build_turn_metrics_payload(final, started)
    assert payload["llm_calls"] == 3
    assert payload["tool_calls"] == 4
    assert payload["tool_success"] == 3
    assert payload["tool_fail"] == 1
    assert payload["compress_count"] == 1
    assert payload["approval_count"] == 1
    assert payload["approval_accept"] == 1
    # 真空断言修正：类型 + 合理范围（毫秒计时可能 round 为 0，但不应超单回合上限）
    assert isinstance(payload["duration_ms"], (int, float))
    assert 0 <= payload["duration_ms"] < 60000
    assert payload["details"]["llm_calls_per_subgraph"] == {"drafting": 2}
    # 任务 28 修复：steps_per_subgraph 从独立 subgraph_steps 通道读取
    assert payload["details"]["steps_per_subgraph"] == {"drafting": 3}


def test_payload_steps_empty_without_subgraph_steps_channel():
    started = time.monotonic()
    payload = build_turn_metrics_payload(
        {"subgraph": "chat", "turn_metrics": {"llm_calls": 1}}, started
    )
    assert payload["details"]["steps_per_subgraph"] == {}


def test_payload_approval_metrics_read_from_turn_metrics():
    started = time.monotonic()
    payload = build_turn_metrics_payload(
        {
            "turn_metrics": {"approval_count": 2, "approval_accept": 1},
            "subgraph_steps": {"outlining": 2},
        },
        started,
    )
    assert payload["approval_count"] == 2
    assert payload["approval_accept"] == 1


# ---------------------------------------------------------------------------
# 落库（FakeSession）
# ---------------------------------------------------------------------------


def test_persist_turn_metrics_writes_row():
    factory = FakeSessionFactory({})
    payload = {
        "thread_id": "t1",
        "subgraph": "drafting",
        "duration_ms": 12.5,
        "llm_calls": 1,
        "tool_calls": 2,
        "tool_success": 2,
        "tool_fail": 0,
        "compress_count": 0,
        "approval_count": 0,
        "approval_accept": 0,
        "details": {"llm_calls_per_subgraph": {"drafting": 1}},
    }
    import asyncio

    from domains.agent.metrics import persist_turn_metrics

    asyncio.run(persist_turn_metrics(factory, user_id=1, book_id=2, payload=payload))
    assert len(factory.session.added) == 1


def test_record_write_audit_writes_row():
    factory = FakeSessionFactory({})
    import asyncio

    from domains.agent.metrics import record_write_audit

    asyncio.run(
        record_write_audit(
            factory,
            thread_id="t1",
            user_id=1,
            book_id=2,
            tool_name="update_entity",
            operation="entity.update",
            args={"kind": "character", "item_id": 3},
            decision="accept",
            result="ok",
        )
    )
    assert len(factory.session.added) == 1
    row = factory.session.added[0]
    assert row.tool_name == "update_entity"
    assert row.decision == "accept"
    assert "character" in row.args_summary


def test_persist_metrics_book_id_zero_normalized_to_none():
    """任务 28 修复：book_id=0（无书籍会话历史约定）必须归一化，避免 FK 违例静默丢数据。"""
    factory = FakeSessionFactory({})
    import asyncio

    from domains.agent.metrics import persist_turn_metrics

    payload = {
        "thread_id": "t-bookless",
        "subgraph": "chat",
        "duration_ms": 5,
        "llm_calls": 1,
        "tool_calls": 0,
        "tool_success": 0,
        "tool_fail": 0,
        "compress_count": 0,
        "approval_count": 0,
        "approval_accept": 0,
        "details": {},
    }
    asyncio.run(persist_turn_metrics(factory, user_id=1, book_id=0, payload=payload))
    row = factory.session.added[0]
    assert row.book_id is None


def test_audit_long_tool_name_truncated_not_dropped():
    """任务 29 修复：超长 tool_name（用户定义工作流 node_id）截断，保证审计行不丢。"""
    factory = FakeSessionFactory({})
    import asyncio

    from domains.agent.metrics import record_write_audit

    long_name = "x" * 200
    asyncio.run(
        record_write_audit(
            factory,
            thread_id="t1",
            user_id=1,
            book_id=1,
            tool_name=long_name,
            operation="workflow.review",
            args={},
            decision="accept",
        )
    )
    assert len(factory.session.added) == 1
    assert factory.session.added[0].tool_name == "x" * 64


def test_audit_book_id_zero_normalized_to_none():
    factory = FakeSessionFactory({})
    import asyncio

    from domains.agent.metrics import record_write_audit

    asyncio.run(
        record_write_audit(
            factory,
            thread_id="t1",
            user_id=1,
            book_id=0,
            tool_name="update_entity",
            operation="entity.update",
            args={},
        )
    )
    assert factory.session.added[0].book_id is None


# ---------------------------------------------------------------------------
# 任务 30（审查修复 H2）：上下文压缩返回 RemoveMessage 而非消息子集
# ---------------------------------------------------------------------------


class _FakeSummaryLLM:
    async def ainvoke(self, messages):
        from langchain_core.messages import AIMessage

        return AIMessage(content="压缩摘要")


class _FakeCompressFactory:
    def __init__(self, config):
        self.main = _FakeSummaryLLM()


@pytest.mark.asyncio
async def test_auto_compress_returns_remove_messages(monkeypatch):
    """任务 30（审查修复 H2）：add_messages 只增不减，压缩必须返回 RemoveMessage
    才能真正裁剪；同时把被删 ID 写入 removed_message_ids 供父层 sync 回流删除。"""
    from langchain_core.messages import RemoveMessage

    from domains.agent import context_manager

    monkeypatch.setattr(context_manager, "ModelFactory", _FakeCompressFactory)

    messages = [
        HumanMessage(content=f"第{i}条", id=f"m{i}")
        for i in range(25)
    ]
    state = {
        "messages": messages,
        "active_book_id": 0,
        "model_config": {"main_config": {}},
        "user_id": 1,
        "compressed_context": None,
    }
    update = await context_manager.auto_compress_node(state)
    # 必须返回 RemoveMessage 列表（而非 messages[-K:] 子集），否则 reducer 不删除旧消息
    assert update["messages"]
    assert all(isinstance(m, RemoveMessage) for m in update["messages"])
    assert len(update["messages"]) == len(messages) - context_manager.COMPRESS_KEEP
    assert update["removed_message_ids"] == [f"m{i}" for i in range(len(messages) - context_manager.COMPRESS_KEEP)]
    assert update["turn_metrics"]["compress_count"] == 1


@pytest.mark.asyncio
async def test_auto_compress_short_conversation_noop(monkeypatch):
    from domains.agent import context_manager

    monkeypatch.setattr(context_manager, "ModelFactory", _FakeCompressFactory)
    messages = [HumanMessage(content=f"第{i}条", id=f"m{i}") for i in range(5)]
    state = {
        "messages": messages,
        "active_book_id": 0,
        "model_config": {"main_config": {}},
        "user_id": 1,
        "compressed_context": None,
    }
    update = await context_manager.auto_compress_node(state)
    assert update == {}
