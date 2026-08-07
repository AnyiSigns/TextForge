"""Agent 调用工作流桥接测试：execute_workflow / execute_workflow_node 参数传递与事件转发。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from models.workflow import Workflow

from domains.agent.tools.workflow_tools import build_workflow_tool


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, workflow=None):
        self.workflow = workflow

    async def execute(self, stmt):
        return ScalarResult(self.workflow)


class FakeSessionCtx:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *a):
        return False


def make_workflow(nodes=None) -> Workflow:
    return Workflow(
        id="wf1",
        name="速写模式",
        user_id=1,
        nodes=nodes or [
            {"id": "writer", "label": "执笔写手", "role": "writer", "system_prompt": "写正文"},
            {"id": "polish", "label": "文风润色师", "role": "polish", "system_prompt": "润色"},
        ],
        edges=[],
    )


async def run_tool(tool, **kwargs):
    """langchain tool 包装后直接调用。"""
    return await tool.ainvoke(kwargs)


@pytest.mark.asyncio
async def test_execute_workflow_passes_context(monkeypatch):
    """execute_workflow：workflow_id/book_id/model_config/rag 上下文正确传给调度器。"""
    import domains.agent.tools.workflow_tools as wf_tools

    captured = {}

    async def fake_run_workflow(**kwargs):
        captured.update(kwargs)
        return {"status": "completed", "node_results": [{"node_id": "writer", "output": "正文"}]}

    monkeypatch.setattr(wf_tools, "scheduler_run_workflow", fake_run_workflow)
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession()), model_config={"adapter": "openai"})
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")

    result = await run_tool(
        execute_workflow,
        workflow_id="wf1",
        instruction="写一章",
        user_id=2,
        book_id=3,
        personal_rag_results=[{"text": "RAG片段"}],
    )

    assert captured["workflow_id"] == "wf1"
    assert captured["book_id"] == 3
    assert captured["model_config"] == {"adapter": "openai"}
    assert captured["personal_rag_results"] == [{"text": "RAG片段"}]
    assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_execute_workflow_forwards_node_stream(monkeypatch):
    """node_stream 进度事件被收集进 progress_events（供 SSE 推送）。"""
    import domains.agent.tools.workflow_tools as wf_tools

    events_sent = []

    async def fake_run_workflow(**kwargs):
        on_progress = kwargs["on_progress"]
        on_progress({"event": "node_start", "node_id": "writer"})
        on_progress({"event": "node_stream", "node_id": "writer", "token": "夜"})
        on_progress({"event": "node_stream", "node_id": "writer", "token": "色"})
        on_progress({"event": "node_end", "node_id": "writer", "tokens": 2})
        return {"status": "completed", "node_results": []}

    monkeypatch.setattr(wf_tools, "scheduler_run_workflow", fake_run_workflow)
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession()))
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")

    result = await run_tool(execute_workflow, workflow_id="wf1", book_id=3, user_id=2)
    events = result["progress_events"]
    assert [e["event"] for e in events] == ["node_start", "node_stream", "node_stream", "node_end"]
    assert events_sent == []  # langgraph 环境外 get_stream_writer 不产生副作用（不抛错即可）


@pytest.mark.asyncio
async def test_execute_workflow_scheduler_error_returns_error(monkeypatch):
    """调度器抛错 → 工具返回 error 状态而非异常上抛。"""
    import domains.agent.tools.workflow_tools as wf_tools

    async def boom(**kwargs):
        raise RuntimeError("模型超时")

    monkeypatch.setattr(wf_tools, "scheduler_run_workflow", boom)
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession()))
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")

    result = await run_tool(execute_workflow, workflow_id="wf1", book_id=3, user_id=2)
    assert result["status"] == "error"
    assert "模型超时" in result["message"]


@pytest.mark.asyncio
async def test_execute_workflow_node_not_found(monkeypatch):
    """节点不存在 → 返回 error，不崩溃。"""
    import domains.agent.tools.workflow_tools as wf_tools
    monkeypatch.setattr(wf_tools, "scheduler_execute_node", lambda **k: {"success": True, "output": "x"})
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession(make_workflow())))
    node_tool = next(t for t in tools if t.name == "execute_workflow_node")

    result = await run_tool(node_tool, workflow_id="wf1", node_id="missing", book_id=3, user_id=2)
    assert result["status"] == "error"
    assert "不存在" in result["message"]


@pytest.mark.asyncio
async def test_execute_workflow_node_upstream_output_truncated(monkeypatch):
    """上游输出超长截断到 3000 字。"""
    import domains.agent.tools.workflow_tools as wf_tools

    captured = {}

    async def fake_execute_node(**kwargs):
        captured.update(kwargs)
        return {"success": True, "output": "ok", "tokens": 10}

    monkeypatch.setattr(wf_tools, "scheduler_execute_node", fake_execute_node)
    # langgraph 环境外 get_stream_writer 无上下文，替换为 no-op
    monkeypatch.setattr(wf_tools, "get_stream_writer", lambda: (lambda ev: None))
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession(make_workflow())))
    node_tool = next(t for t in tools if t.name == "execute_workflow_node")

    long_text = "长" * 5000
    result = await run_tool(
        node_tool,
        workflow_id="wf1",
        node_id="writer",
        upstream_outputs={"polish": long_text},
        book_id=3,
        user_id=2,
    )

    upstream = captured["upstream_outputs"]["polish"]
    assert len(upstream) <= 3010
    assert "已截断" in upstream
    assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_execute_workflow_node_injects_context_fields(monkeypatch):
    """context_fields 注入到节点定义。"""
    import domains.agent.tools.workflow_tools as wf_tools

    captured = {}

    async def fake_execute_node(**kwargs):
        captured.update(kwargs)
        return {"success": True, "output": "ok"}

    monkeypatch.setattr(wf_tools, "scheduler_execute_node", fake_execute_node)
    monkeypatch.setattr(wf_tools, "get_stream_writer", lambda: (lambda ev: None))
    tools = build_workflow_tool(lambda: FakeSessionCtx(FakeSession(make_workflow())))
    node_tool = next(t for t in tools if t.name == "execute_workflow_node")

    await run_tool(
        node_tool,
        workflow_id="wf1",
        node_id="writer",
        context_fields=["book_info", "characters"],
        book_id=3,
        user_id=2,
    )
    assert captured["node_def"]["context_fields"] == ["book_info", "characters"]
    assert captured["book_id"] == 3


@pytest.mark.asyncio
async def test_execute_workflow_forwards_upstream_outputs(monkeypatch):
    """execute_workflow：Agent 联网搜索结果经 upstream_outputs 传入 pending_workflow。"""
    from domains.agent.tools.workflow_bridge_tools import build_workflow_bridge_tools

    tools = build_workflow_bridge_tools(lambda: FakeSessionCtx(FakeSession()))
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")

    result = await run_tool(
        execute_workflow,
        workflow_id="wf1",
        upstream_outputs={"web_search": "联网搜索结果正文"},
        book_id=3,
        user_id=2,
    )
    pending = result["pending_workflow"]
    assert pending["workflow_id"] == "wf1"
    assert pending["upstream_outputs"]["web_search"] == "联网搜索结果正文"
