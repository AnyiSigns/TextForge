"""Agent 调用工作流桥接测试：execute_workflow / execute_workflow_node 参数传递与事件转发。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from domains.agent.tools.workflow_bridge_tools import build_workflow_bridge_tools
from models.workflow import Workflow


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
        nodes=nodes
        or [
            {"id": "writer", "label": "执笔写手", "role": "writer", "system_prompt": "写正文"},
            {"id": "polish", "label": "文风润色师", "role": "polish", "system_prompt": "润色"},
        ],
        edges=[],
    )


async def run_tool(tool, **kwargs):
    """langchain tool 包装后直接调用。"""
    return await tool.ainvoke(kwargs)


@pytest.mark.asyncio
async def test_execute_workflow_forwards_upstream_outputs():
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


@pytest.mark.asyncio
async def test_execute_workflow_resolves_book_workflow():
    """未传 workflow_id 时自动解析书籍绑定的工作流。"""
    book = SimpleNamespace(workflow_id="wf2")
    tools = build_workflow_bridge_tools(
        lambda: FakeSessionCtx(FakeSession(workflow=None))
    )
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")
    # 书籍绑定解析：patch _resolve_book_workflow_id 返回固定 ID
    import domains.agent.tools.workflow_bridge_tools as bridge_tools

    async def fake_resolve(session_factory, book_id):
        return "wf2"

    bridge_tools._resolve_book_workflow_id = fake_resolve
    result = await run_tool(execute_workflow, book_id=3, user_id=2)
    assert result["pending_workflow"]["workflow_id"] == "wf2"
    assert result["status"] == "queued"


@pytest.mark.asyncio
async def test_execute_workflow_missing_workflow_returns_error():
    """无 workflow_id 且书籍未绑定 → 返回 error，不崩溃。"""
    import domains.agent.tools.workflow_bridge_tools as bridge_tools

    async def fake_resolve(session_factory, book_id):
        return None

    bridge_tools._resolve_book_workflow_id = fake_resolve
    tools = build_workflow_bridge_tools(lambda: FakeSessionCtx(FakeSession()))
    execute_workflow = next(t for t in tools if t.name == "execute_workflow")

    result = await run_tool(execute_workflow, book_id=3, user_id=2)
    assert result["status"] == "error"
    assert "未绑定工作流" in result["message"]


@pytest.mark.asyncio
async def test_execute_workflow_node_passes_params():
    """execute_workflow_node：target_chapter_id / context_fields 写入 pending。"""
    tools = build_workflow_bridge_tools(lambda: FakeSessionCtx(FakeSession()))
    node_tool = next(t for t in tools if t.name == "execute_workflow_node")

    result = await run_tool(
        node_tool,
        workflow_id="wf1",
        node_id="writer",
        target_chapter_id=7,
        context_fields=["book_info", "characters"],
        book_id=3,
        user_id=2,
    )
    pending = result["pending_workflow"]
    assert pending["workflow_id"] == "wf1"
    assert pending["node_id"] == "writer"
    assert pending["target_chapter_id"] == 7
    assert pending["context_fields"] == ["book_info", "characters"]
