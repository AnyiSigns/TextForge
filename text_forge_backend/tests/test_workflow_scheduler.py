"""workflow_scheduler 测试：节点输出与调度逻辑。

覆盖：
- 拓扑排序（线性 / 依赖 / 循环检测）
- 上下文关键词分配
- 上下文/上游输出/RAG 格式化
- execute_node 节点输出：空输出、LLM 异常、正常输出、超长截断、审计不合格
- audit_node_output：短输出直通 / FAIL 判定 / 异常默认通过

LLM 全部使用假模型，不依赖真实 API 与数据库。
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from domains.agent import workflow_scheduler as wf

# ---------------------------------------------------------------------------
# 假模型
# ---------------------------------------------------------------------------

class FakeStreamLLM:
    """astream 生成器假模型（execute_node 使用 astream）。"""

    def __init__(self, chunks: list[str], raise_error: bool = False):
        self._chunks = chunks
        self._should_raise = raise_error

    async def astream(self, messages):
        if self._should_raise:
            raise RuntimeError("模拟 LLM 调用失败")
        for c in self._chunks:
            yield SimpleNamespace(content=c)


class FakeAuditLLM:
    """ainvoke 假审核模型。"""

    def __init__(self, response: str):
        self._response = response

    async def ainvoke(self, messages):
        return SimpleNamespace(content=self._response)


class FakeNodeModelFactory:
    """假 ModelFactory：main 走 astream，audit 走 ainvoke。"""

    def __init__(self, config: dict):
        chunks = config.get("chunks") or ["测试输出内容"]
        audit_response = config.get("audit_response", "PASS")
        self.main = FakeStreamLLM(chunks, raise_error=config.get("raise_error", False))
        self.audit = FakeAuditLLM(audit_response)

    def set_main_error(self):
        self.main._should_raise = True


# ---------------------------------------------------------------------------
# 拓扑排序
# ---------------------------------------------------------------------------

def test_topological_sort_linear_without_edges():
    nodes = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert [n["id"] for n in wf.topological_sort(nodes, [])] == ["a", "b", "c"]


def test_topological_sort_respects_dependencies():
    nodes = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]
    result = [n["id"] for n in wf.topological_sort(nodes, edges)]
    assert result.index("a") < result.index("b") < result.index("c")


def test_topological_sort_cycle_raises():
    nodes = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "a"}]
    with pytest.raises(wf.WorkflowCycleError):
        wf.topological_sort(nodes, edges)


# ---------------------------------------------------------------------------
# 上下文关键词分配
# ---------------------------------------------------------------------------

def test_auto_allocate_context_matches_keywords():
    fields = wf.auto_allocate_context("你是执笔写手，负责根据大纲和角色写正文")
    assert "book_info" in fields  # 始终包含
    assert "characters" in fields
    assert "outline_structure" in fields


def test_auto_allocate_context_no_match_returns_book_info():
    fields = wf.auto_allocate_context("请输出一些内容")
    assert fields == ["book_info"]


# ---------------------------------------------------------------------------
# 序列化与上下文格式化
# ---------------------------------------------------------------------------

def test_format_context_field_book_info():
    rec = SimpleNamespace(title="测试书", description="简介", genre="奇幻")
    text = wf._format_context_field("book_info", [rec])
    assert "《测试书》" in text
    assert "奇幻" in text


def test_format_context_field_characters():
    rec = SimpleNamespace(name="主角", description="勇者", role_type="主角", status="活跃")
    text = wf._format_context_field("characters", [rec])
    assert "主角（主角）" in text
    assert "状态：活跃" in text


def test_format_prompt_context_upstream_truncation():
    long_output = "字" * 4000
    text = wf._format_prompt_context({}, upstream_outputs={"n1": long_output})
    assert "[上游节点 n1 输出]" in text
    assert "已截断" in text


def test_format_prompt_context_empty_returns_placeholder():
    assert wf._format_prompt_context({}) == "（无上下文）"


def test_format_prompt_context_rag_and_structured():
    structured = {
        "characters": [SimpleNamespace(name="A", description="d", role_type="主角", status="")],
    }
    rag = [{"doc_name": "设定集", "content": "内容", "score": 0.85}]
    text = wf._format_prompt_context(structured, rag, None)
    assert "个人知识库检索结果" in text
    assert "相关度：85.0%" in text
    assert "角色档案" in text


# ---------------------------------------------------------------------------
# execute_node 节点输出
# ---------------------------------------------------------------------------

async def run_node(monkeypatch, config, node_def=None, book_id=1, **kw):
    """安装假模型 + 空上下文，执行 execute_node。"""
    factories: list[FakeNodeModelFactory] = []
    monkeypatch.setattr(
        wf, "ModelFactory",
        lambda cfg: (factories.append(FakeNodeModelFactory(cfg)), factories[-1])[1],
    )

    async def _q(*a, **k):
        return {}

    monkeypatch.setattr(wf, "_load_context_pool", _q)
    monkeypatch.setattr(wf, "_query_structured_context", _q)
    result = await wf.execute_node(
        node_def=node_def or {"id": "n1", "system_prompt": "测试节点", "executor": "main"},
        book_id=book_id,
        model_config=config,
        node_id="n1",
        **kw,
    )
    return result, (factories[0] if factories else None)


@pytest.mark.asyncio
async def test_execute_node_empty_output(monkeypatch):
    result, factory = await run_node(monkeypatch, {"chunks": [""]})
    assert result["success"] is False
    assert result["quality_check"]["reason"] == "输出为空"
    assert result["tokens"] == 0


@pytest.mark.asyncio
async def test_execute_node_llm_error(monkeypatch):
    result, factory = await run_node(monkeypatch, {"chunks": ["x"], "raise_error": True})
    assert result["success"] is False
    assert result["quality_check"]["reason"] == "LLM 调用失败"
    assert result["output"] == ""


@pytest.mark.asyncio
async def test_execute_node_success(monkeypatch):
    result, factory = await run_node(monkeypatch, {"chunks": ["你好", "世界"]})
    assert result["success"] is True
    assert result["output"] == "你好世界"
    assert result["tokens"] == 2
    assert result["needs_review"] is False
    assert result["quality_check"]["passed"] is True


@pytest.mark.asyncio
async def test_execute_node_audit_fail_sets_needs_review(monkeypatch):
    # 输出必须 > 50 字才触发审计（否则 audit_node_output 直接通过）
    long_chunk = "这里是一段足够长的输出内容用于触发审计逻辑。" * 3
    result, factory = await run_node(monkeypatch, {"chunks": [long_chunk], "audit_response": "FAIL 不符合要求"})
    assert result["success"] is True
    assert result["needs_review"] is True
    assert result["quality_check"]["passed"] is False


@pytest.mark.asyncio
async def test_execute_node_long_output_truncated(monkeypatch):
    long_chunk = "长" * 10000
    result, factory = await run_node(monkeypatch, {"chunks": [long_chunk]})
    assert result["success"] is True
    # 截断后长度 = 3000 + 省略标记 + 2000
    assert "（中间省略）" in result["output"]
    assert len(result["output"]) < 8000


@pytest.mark.asyncio
async def test_execute_node_emits_progress_events(monkeypatch):
    events = []
    result, factory = await run_node(
        monkeypatch,
        {"chunks": ["内容"]},
        on_progress=events.append,
    )
    kinds = [e["event"] for e in events]
    assert kinds[0] == "node_start"
    assert "node_stream" in kinds
    assert kinds[-1] == "node_end"
    # node_end 携带输出预览
    assert events[-1]["output_preview"]


# ---------------------------------------------------------------------------
# audit_node_output
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_audit_short_output_passes_without_llm(monkeypatch):
    def should_not_construct(cfg):
        raise AssertionError("短输出不应构造 LLM")
    monkeypatch.setattr(wf, "ModelFactory", should_not_construct)
    result = await wf.audit_node_output("短", "prompt", {})
    assert result == {"passed": True}


@pytest.mark.asyncio
async def test_audit_fail_prefix(monkeypatch):
    class FailAudit:
        async def ainvoke(self, m):
            return SimpleNamespace(content="FAIL 字数不足")
    monkeypatch.setattr(wf, "ModelFactory", lambda cfg: SimpleNamespace(audit=FailAudit()))
    result = await wf.audit_node_output("这里是一段足够长的输出内容用于审计测试……" * 5, "要求", {})
    assert result["passed"] is False
    assert "FAIL" in result["reason"]


@pytest.mark.asyncio
async def test_audit_llm_exception_defaults_pass(monkeypatch):
    class BoomAudit:
        async def ainvoke(self, m):
            raise RuntimeError("boom")
    monkeypatch.setattr(wf, "ModelFactory", lambda cfg: SimpleNamespace(audit=BoomAudit()))
    result = await wf.audit_node_output("足够长的输出内容用于触发审计逻辑。" * 20, "要求", {})
    assert result == {"passed": True}


@pytest.mark.asyncio
async def test_audit_pass_response(monkeypatch):
    class PassAudit:
        async def ainvoke(self, m): return SimpleNamespace(content="PASS 符合要求")
    monkeypatch.setattr(wf, "ModelFactory", lambda cfg: SimpleNamespace(audit=PassAudit()))
    result = await wf.audit_node_output("足够长的输出内容用于触发审计逻辑。" * 20, "要求", {})
    assert result == {"passed": True}


# ---------------------------------------------------------------------------
# run_workflow：seed_upstream_outputs（Agent 联网搜索结果）注入每个节点
# ---------------------------------------------------------------------------

class FakeWFDB:
    """模拟 db_manager.with_db 上下文，execute 返回工作流。"""

    def __init__(self, workflow):
        self.workflow = workflow

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt):
        return ScalarResult(self.workflow)


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


@pytest.mark.asyncio
async def test_run_workflow_injects_seed_upstream_outputs(monkeypatch):
    """seed_upstream_outputs（如联网搜索结果）应注入每个工作流节点上下文。"""
    wf_workflow = SimpleNamespace(
        id="wf1",
        name="测试工作流",
        user_id=1,
        nodes=[
            {"id": "n1", "label": "节点1", "executor": "main", "system_prompt": "写正文"},
            {"id": "n2", "label": "节点2", "executor": "main", "system_prompt": "写正文"},
        ],
        edges=[],
    )
    seen_upstreams: list[dict] = []
    calls: list[dict] = []

    async def fake_execute_node(**kwargs):
        calls.append(kwargs)
        seen_upstreams.append(kwargs.get("upstream_outputs"))
        return {"success": True, "output": "节点输出", "needs_review": False, "quality_check": {"passed": True}, "tokens": 3}

    monkeypatch.setattr(wf, "db_manager", SimpleNamespace(with_db=lambda: FakeWFDB(wf_workflow)))
    monkeypatch.setattr(wf, "execute_node", fake_execute_node)

    result = await wf.run_workflow(
        workflow_id="wf1",
        book_id=1,
        model_config={},
        on_progress=lambda ev: None,
        seed_upstream_outputs={"web_search": "联网搜索结果正文"},
    )

    assert result["status"] == "completed"
    assert len(seen_upstreams) == 2
    # 无 edges 时每个节点都拿到完整 seed 上游输出
    for upstream in seen_upstreams:
        assert upstream.get("web_search") == "联网搜索结果正文"
