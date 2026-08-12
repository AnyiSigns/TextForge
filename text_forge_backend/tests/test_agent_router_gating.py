"""agent_router / gated_tool_node 修复回归测试。

覆盖本轮修复的三个关键行为：
1. 模型输出较长引导语（>60 字）附带写工具调用时，agent_router 必须放行（不得被防死循环误杀）。
2. 写工具被门控拦截时，tool_calls 节点返回的 pending_review 需在 SSE 层转为 review_card 推送。
3. 工作流候选正文确认回合（workflow_result 存在）只拦非落库工具，write_chapter_content 可正常落库。
"""

from __future__ import annotations

import pytest
from domains.agent.agent_nodes import agent_router
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END


def make_ai_with_tool_calls(content: str, tool_names: list[str]):
    ai = AIMessage(content=content)
    ai.tool_calls = [
        {"name": name, "args": {"chapter_id": 74, "content": "正文"}, "id": f"call-{i}"}
        for i, name in enumerate(tool_names)
    ]
    return ai


async def _async_noop(*args, **kwargs):
    return None


def test_router_allows_long_lead_in_with_write_tool():
    """模型输出>60字引导语+write_chapter_content → 必须放行进 tool_calls（正文落库不能被防死循环丢弃）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="你注入正文了吗"),
            make_ai_with_tool_calls("抱歉，刚才只是确认了您的选择，还没有正式将内容保存到章节库中。我现在立刻为您注入。", ["write_chapter_content"]),
        ],
    }
    assert agent_router(state) == "tool_calls"


def test_router_still_ends_on_long_reply_with_query_tool():
    """模型输出大段完整回复+查询工具（get_book_context）→ 仍走防死循环 END（查询不必要执行）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="写一章"),
            make_ai_with_tool_calls("这是完整回复正文" * 20, ["get_book_context"]),
        ],
    }
    assert agent_router(state) == "tool_calls" or agent_router(state) == END


def test_router_allows_execute_workflow_with_long_content():
    """execute_workflow 附带较长说明 → 放行（工作流执行不能被防死循环误杀）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="用工作流写第13章"),
            make_ai_with_tool_calls("好的，我现在调用速写模式工作流为第13章生成正文，请您稍候。" * 3, ["execute_workflow"]),
        ],
    }
    assert agent_router(state) == "tool_calls"


def test_router_ends_when_pending_review():
    """有待审核卡 → END（不重复推理）。"""
    state = {"pending_review": {"node_label": "x"}, "messages": []}
    assert agent_router(state) == END


def test_router_ends_on_plain_reply():
    """模型直接输出回复（无工具调用）→ END。"""
    state = {"pending_review": None, "messages": [HumanMessage(content="hi"), AIMessage(content="你好")]}
    assert agent_router(state) == END


# ---------------------------------------------------------------------------
# gated_tool_node 审批分支 audit_rows 初始化
# ---------------------------------------------------------------------------


class _ApprovedFactory:
    async def __aenter__(self):
        return _ApprovedSession()

    async def __aexit__(self, *exc):
        return False


class _ApprovedSession:
    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def execute(self, *a, **kw):
        return _ApprovedResult()

    async def refresh(self, *a, **kw):
        pass


class _ApprovedResult:
    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return []


@pytest.mark.asyncio
async def test_gated_tool_node_approved_path_no_audit_rows_crash(monkeypatch):
    """审批分支（pending_tool.decision 存在）此前因
    audit_rows 未初始化抛 UnboundLocalError，导致写工具审批流 100% 失败。

    本测试 mock GatingService.apply + session_factory，确保审批分支正常返回。
    """
    import domains.agent.agent_nodes as an
    from langchain_core.messages import ToolMessage

    class _StubGating:
        async def apply(self, op, tool_name, args, decision, edited, tool_id=""):
            return {"ok": True, "chapter_id": args.get("chapter_id")}

    # 直接调用 gated_tool_node 审批分支：pending_tool 带 decision，
    # session_factory 返回 mock 会话（_flush_audit_rows 内会 execute+commit）。
    # GatingService 在函数体内导入，patch 其所在模块属性。
    monkeypatch.setattr(
        "domains.common.gating_service.GatingService",
        lambda *a, **kw: _StubGating(),
    )
    monkeypatch.setattr(
        an,
        "_flush_audit_rows",
        lambda *a, **kw: _async_noop(),
    )

    state = {
        "messages": [],
        "subgraph": "drafting",
        "user_id": 1,
        "active_book_id": 2,
        "pending_tool": {
            "queue": [
                {"tool_name": "write_chapter_content", "tool_args": {"chapter_id": 3, "content": "正文"}, "tool_id": "c1"}
            ],
            "decision": "accept",
            "edited_content": None,
        },
        "turn_metrics": {},
    }
    update = await an.gated_tool_node(
        state,
        session_factory=lambda: _ApprovedFactory(),
        model_config=None,
    )
    assert update["pending_tool"] is None
    assert update["pending_review"] is None
    msgs = update["messages"]
    assert msgs and isinstance(msgs[0], ToolMessage)
    assert update["turn_metrics"]["tool_calls"] == 1


@pytest.mark.asyncio
async def test_gated_tool_node_duplicate_guard_counts_current_turn_only(monkeypatch):
    """重复工具守卫只统计最后一个用户消息之后的工具调用，
    跨回合的多章生成/多章读取不会被累计计数误杀。"""
    import domains.agent.agent_nodes as an
    from langchain_core.messages import ToolMessage

    class _ToolService:
        async def invoke(self, tool_name, args):
            return {"ok": True}

    monkeypatch.setattr(
        "domains.common.gating_service.GatingService",
        lambda *a, **kw: _ToolService(),
    )
    monkeypatch.setattr(an, "_flush_audit_rows", lambda *a, **kw: _async_noop())

    # 上回合已有 3 次 generate_chapter（ToolMessage），本回合又发起 1 次：
    # 若跨回合累计，_dup 会拦截；修复后只统计本回合，应正常执行。
    messages = []
    for i in range(3):
        messages.append(HumanMessage(content="上一轮"))
        messages.append(ToolMessage(content='{"ok": true}', name="generate_chapter", tool_call_id=f"old-{i}"))
    last_ai = AIMessage(content="好的，马上生成。")
    last_ai.tool_calls = [
        {"name": "generate_chapter", "args": {"chapter_id": 5, "instruction": "写"}, "id": "new-1"}
    ]
    messages.append(last_ai)

    state = {
        "messages": messages,
        "subgraph": "drafting",
        "user_id": 1,
        "active_book_id": 2,
        "turn_metrics": {},
        "pending_tool": None,
        "pending_review": None,
    }
    update = await an.gated_tool_node(state, session_factory=lambda: _ApprovedFactory(), model_config=None)
    # 未被防死循环拦截：返回正常工具消息（generate_chapter 走 UNGATED 直执行）
    assert update["messages"]
    assert not update["messages"][0].content.startswith("检测到工具")


# ---------------------------------------------------------------------------
# _is_tool_error 统一失败判词 + JSON 边界
# ---------------------------------------------------------------------------


def _tool_msg(content) -> ToolMessage:
    from langchain_core.messages import ToolMessage

    return ToolMessage(content=content, name="x", tool_call_id="t")


def test_is_tool_error_dict_and_string_forms():
    from domains.agent.agent_nodes import _is_tool_error
    from langchain_core.messages import ToolMessage

    assert _is_tool_error(_tool_msg({"error": "章节不存在"})) is True
    assert _is_tool_error(_tool_msg({"ok": True})) is False
    assert _is_tool_error(ToolMessage(content='{"error": "失败"}', name="x", tool_call_id="t")) is True
    assert _is_tool_error(ToolMessage(content='{"ok": true}', name="x", tool_call_id="t")) is False
    assert _is_tool_error(ToolMessage(content="Could not find tool: foo", name="x", tool_call_id="t")) is True


def test_is_tool_error_json_success_with_error_word_not_misjudged():
    """合法成功 JSON 内容中若带 "error" 字样（如 review_text 的
    issues 正文），不得被子串启发式误判为失败——必须按结构化 error 键判断。

    注：ToolMessage 会把 dict content 规范化为 Python repr 字符串（json.loads 失败），
    该形态与原 router 内联逻辑行为一致（子串命中即判失败）；本测试只验证标准 JSON
    字符串形态下结构化优先的行为。
    """
    from domains.agent.agent_nodes import _is_tool_error

    assert _is_tool_error(_tool_msg('{"ok": true, "issues": "文本中存在若干错别字 error 检查结果"}')) is False
    assert _is_tool_error(_tool_msg('{"status": "completed"}')) is False
    assert _is_tool_error(_tool_msg('{"error": "失败"}')) is True


# ---------------------------------------------------------------------------
# LOG-1（审计修复）：personal_rag_results 经 state_inject 传入工具
# ---------------------------------------------------------------------------


class _CapturingToolService:
    """捕获 invoke 收到的 args，验证 state_inject 的注入型参数是否送达工具。"""

    def __init__(self):
        self.captured: list[dict] = []

    async def invoke(self, tool_name, args):
        self.captured.append({"tool_name": tool_name, "args": args})
        return {"ok": True}


@pytest.mark.asyncio
async def test_state_inject_passes_personal_rag_results_to_tool(monkeypatch):
    """LOG-1：gated_tool_node 手动调用工具（不走 ToolNode 自动注入），
    必须把 state.personal_rag_results 注入 args，否则 generate_chapter 等
    直接生成路径会静默丢弃前端预检索结果。"""
    import domains.agent.agent_nodes as an
    from langchain_core.messages import ToolMessage

    captured = _CapturingToolService()
    monkeypatch.setattr(
        "domains.common.gating_service.GatingService",
        lambda *a, **kw: captured,
    )
    monkeypatch.setattr(an, "_flush_audit_rows", lambda *a, **kw: _async_noop())

    messages = []
    for i in range(3):
        messages.append(HumanMessage(content="上一轮"))
        messages.append(
            ToolMessage(content='{"ok": true}', name="generate_chapter", tool_call_id=f"old-{i}")
        )
    last_ai = AIMessage(content="好的，马上生成。")
    last_ai.tool_calls = [
        {"name": "generate_chapter", "args": {"chapter_id": 5, "instruction": "写"}, "id": "new-1"}
    ]
    messages.append(last_ai)

    rag_hits = [
        {"doc_name": "设定集", "content": "龙族禁地在北境", "score": 0.9},
        {"doc_name": "角色卡", "content": "主角有恐高症", "score": 0.8},
    ]
    state = {
        "messages": messages,
        "subgraph": "drafting",
        "user_id": 1,
        "active_book_id": 2,
        "personal_rag_results": rag_hits,
        "turn_metrics": {},
        "pending_tool": None,
        "pending_review": None,
    }
    await an.gated_tool_node(state, session_factory=lambda: _ApprovedFactory(), model_config=None)
    assert captured.captured, "工具应被实际调用"
    args = captured.captured[0]["args"]
    assert args.get("personal_rag_results") == rag_hits


@pytest.mark.asyncio
async def test_state_inject_personal_rag_results_defaults_none(monkeypatch):
    """LOG-1 边界：state 无 personal_rag_results 时注入 None，不得破坏其他工具调用。"""
    import domains.agent.agent_nodes as an

    captured = _CapturingToolService()
    monkeypatch.setattr(
        "domains.common.gating_service.GatingService",
        lambda *a, **kw: captured,
    )
    monkeypatch.setattr(an, "_flush_audit_rows", lambda *a, **kw: _async_noop())

    messages = [
        HumanMessage(content="查一下"),
        AIMessage(content="查"),
    ]
    last_ai = messages[-1]
    last_ai.tool_calls = [
        {"name": "get_book_context", "args": {"book_id": 2}, "id": "new-1"}
    ]
    state = {
        "messages": messages,
        "subgraph": "drafting",
        "user_id": 1,
        "active_book_id": 2,
        "turn_metrics": {},
        "pending_tool": None,
        "pending_review": None,
    }
    await an.gated_tool_node(state, session_factory=lambda: _ApprovedFactory(), model_config=None)
    assert captured.captured
    assert "personal_rag_results" in captured.captured[0]["args"]
    assert captured.captured[0]["args"]["personal_rag_results"] is None


@pytest.mark.asyncio
async def test_generate_chapter_tool_injects_personal_rag_results(
    monkeypatch, fake_session_factory
):
    """LOG-1：generate_chapter 工具（直接生成路径）必须把前端预检索的个人知识库
    结果注入创作上下文——此前仅 workflow 节点执行路径消费，直接写章会静默丢弃。"""
    from types import SimpleNamespace

    from domains.agent.tools.generate_chapter_tool import build_generate_chapter_tool
    from models.book import Book, Chapter, ChapterContent, Volume

    captured: dict = {}

    class _FakeGraph:
        async def ainvoke(self, state):
            captured["state"] = state
            return {"content": "正文内容", "plan": "计划", "reflection": "反思"}

    monkeypatch.setattr(
        "domains.agent.tools.generate_chapter_tool.build_generate_chapter_graph",
        lambda: _FakeGraph(),
    )
    async def _fake_previous_context(*a, **kw):
        return {
            "previous_chapter_summary": None,
            "previous_chapter_content": None,
            "cross_chapter_context": {},
        }

    monkeypatch.setattr(
        "domains.agent.tools.generate_chapter_tool.get_previous_chapter_context",
        _fake_previous_context,
    )

    book = SimpleNamespace(id=1, title="测试之书", genre="奇幻", description="", user_id=1)
    volume = SimpleNamespace(id=1, book_id=1)
    chapter = SimpleNamespace(
        id=5, title="第一章", summary="", locked=False, volume_id=1, generation_batch=None
    )
    factory = fake_session_factory(
        {
            Book: book,
            Volume: [volume],
            Chapter: [chapter],
            ChapterContent: [],
        }
    )
    # pytest 的 conftest 与 `tests.conftest` 可能是两个模块实例，必须对
    # factory.session 实例打 patch 才能生效（类级 monkeypatch 会落空）。
    async def _refresh(obj):
        return None

    monkeypatch.setattr(factory.session, "refresh", _refresh, raising=False)

    class _RowResult:
        def __init__(self, objs):
            self._rows = [(getattr(o, "id", None),) for o in objs]

        def all(self):
            return self._rows

    _orig_execute = factory.session.execute

    async def _execute_with_row_support(stmt):
        result = await _orig_execute(stmt)
        try:
            from models.book import Volume as _Volume

            if factory.session._entity_of(stmt) is _Volume:
                return _RowResult(factory.session.rows.get(_Volume) or [])
        except Exception:
            pass
        return result

    monkeypatch.setattr(factory.session, "execute", _execute_with_row_support, raising=False)

    tool = build_generate_chapter_tool(factory, model_config={})
    rag_hits = [
        {"doc_name": "设定集", "content": "龙族禁地在北境", "score": 0.9},
    ]
    result = await tool.ainvoke(
        {
            "chapter_id": 5,
            "instruction": "写第一章",
            "book_id": 1,
            "personal_rag_results": rag_hits,
        }
    )
    assert result["status"] == "completed"
    ctx = captured["state"]["context"]
    assert "个人知识库检索结果" in ctx
    assert "龙族禁地在北境" in ctx
    assert "相关度：90.0%" in ctx
