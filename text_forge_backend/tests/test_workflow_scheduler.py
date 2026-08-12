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
from domains.agent import workflow_execute as we
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
    """假 ModelFactory：main/audit/router/tool 档位齐全，main 走 astream，audit 走 ainvoke。"""

    def __init__(self, config: dict):
        chunks = config.get("chunks") or ["测试输出内容"]
        audit_response = config.get("audit_response", "PASS")
        self.main = FakeStreamLLM(chunks, raise_error=config.get("raise_error", False))
        self.audit = FakeAuditLLM(audit_response)
        self.router = FakeStreamLLM(chunks)
        self.tool = FakeStreamLLM(chunks)

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
    assert "outline_detail" in fields


def test_auto_allocate_context_no_match_returns_book_info():
    fields = wf.auto_allocate_context("请输出一些内容")
    assert fields == ["book_info"]


def test_auto_allocate_context_setting_and_scene_keywords():
    fields = wf.auto_allocate_context("你是文风润色师，检查文风是否与设定一致，参考本章场景")
    assert "setting" in fields
    assert "chapter_scene_event" in fields
    assert "creative_settings" not in fields  # 旧键已统一为 setting


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
# v2.2 上下文体系：previous_chapters / outline_detail / chapter_scene_event
# ---------------------------------------------------------------------------

def test_format_previous_chapters_full_content():
    rec = SimpleNamespace(
        title="少年出山", volume_title="第一卷 初入江湖", sort_order=1,
        summary="拜师下山", content="完整正文" * 100,
    )
    text = wf._format_context_field("previous_chapters", [rec])
    assert "上一章《少年出山》" in text
    assert "章节摘要：拜师下山" in text
    assert "完整正文" in text
    # 完整正文上限 8000 字截断
    assert len(text) < 9000


def test_format_outline_detail_toc():
    tree = [
        SimpleNamespace(
            title="第一卷 初入江湖", summary="卷摘要", sort_order=1,
            chapters=[
                SimpleNamespace(
                    title="少年出山", summary="拜师下山", sort_order=1,
                    events=[
                        SimpleNamespace(id=1, title="进城遇袭", story_label="第一天上午"),
                        SimpleNamespace(id=2, title="客栈风波", story_label=""),
                    ],
                )
            ],
        )
    ]
    text = wf._format_context_field("outline_detail.toc", tree)
    assert "第一卷 初入江湖" in text
    assert "第1章 少年出山" in text
    assert "进城遇袭（第一天上午）" in text
    assert "客栈风波" in text
    # toc 不含卷/章摘要
    assert "卷摘要" not in text
    assert "拜师下山" not in text


def test_format_outline_detail_with_summaries():
    tree = [
        SimpleNamespace(
            title="第一卷 初入江湖", summary="卷摘要", sort_order=1,
            chapters=[SimpleNamespace(title="少年出山", summary="拜师下山", sort_order=1, events=[])],
        )
    ]
    text = wf._format_context_field("outline_detail", tree)
    assert "卷摘要：卷摘要" in text
    assert "拜师下山" in text


def test_format_chapter_scene_event_with_chain():
    node = SimpleNamespace(
        chapter=SimpleNamespace(title="客栈风波", volume_title="第一卷 初入江湖", sort_order=2),
        events=[
            SimpleNamespace(
                id=1, title="客栈对峙", content="冲突升级", event_type="scene",
                story_label="第二天",
                location=SimpleNamespace(
                    id=10, name="悦来客栈", type="场所", description="镇中心客栈",
                    ancestors=[SimpleNamespace(id=1, name="临安镇", type="城镇")],
                    children=[SimpleNamespace(id=11, name="后院", type="场所")],
                ),
                characters=[
                    SimpleNamespace(
                        id=1, name="林晚", aliases=["晚晚"], description="青城弟子",
                        role_type="主角", status="活跃",
                        custom_fields={"功法": "青莲剑诀", "武器": ["承影剑", "软鞭"]},
                        base_location_name="悦来客栈",
                        relationship_chain=[{"target": "苏妧", "relation": "师姐"}],
                        chain_characters=[
                            SimpleNamespace(
                                id=2, name="苏妧", aliases=[], description="青城大师姐",
                                role_type="配角", status="活跃",
                                custom_fields={}, base_location_name="青城山",
                            )
                        ],
                    )
                ],
                plot_threads=[SimpleNamespace(id=1, name="寻剑", status="进行中")],
                completed_plot_threads=[],
                foreshadowings=[SimpleNamespace(id=1, description="玉佩来历", status="已回收")],
            )
        ],
    )
    text = wf._format_context_field("outline_detail.chapter_scene_event", [node])
    assert "本章场景（第2章《客栈风波》·第一卷 初入江湖" in text
    assert "时间：第二天" in text
    assert "地点：悦来客栈（场所）" in text
    assert "父链：临安镇" in text
    assert "子地点：后院" in text
    assert "林晚（主角）" in text
    assert "别名：晚晚" in text
    assert "功法：青莲剑诀" in text
    assert "武器：承影剑、软鞭" in text
    assert "当前地点：悦来客栈" in text
    assert "关系链：苏妧（师姐）" in text
    assert "· 苏妧（配角）" in text
    assert "情节线：寻剑（进行中）" in text
    assert "揭示伏笔：玉佩来历（已回收）" in text


def test_format_locations_with_parent_chain():
    loc = SimpleNamespace(
        name="后院", type="场所", description="堆杂物",
        ancestors=[SimpleNamespace(id=1, name="悦来客栈", type="场所")],
        children=[],
    )
    text = wf._format_context_field("locations", [loc])
    assert "后院（场所）" in text
    assert "父链：悦来客栈" in text


def test_format_setting_keeps_custom_dimensions():
    rec = SimpleNamespace(
        worldview="东方仙侠世界", tone="热血",
        writing_taboos="禁止现代词汇", custom_dimensions={"灵气体系": ["练气", "筑基"]},
    )
    text = wf._format_context_field("setting", [rec])
    assert "世界观" in text
    assert "东方仙侠世界" in text
    assert "灵气体系：练气、筑基" in text


# ---------------------------------------------------------------------------
# execute_node 节点输出
# ---------------------------------------------------------------------------

async def run_node(monkeypatch, config, node_def=None, book_id=1, **kw):
    """安装假模型 + 空上下文，执行 execute_node。"""
    factories: list[FakeNodeModelFactory] = []
    monkeypatch.setattr(
        we, "ModelFactory",
        lambda cfg: (factories.append(FakeNodeModelFactory(cfg)), factories[-1])[1],
    )

    async def _q(*a, **k):
        return {}

    monkeypatch.setattr(we, "_load_context_pool", _q)
    monkeypatch.setattr(we, "_query_structured_context", _q)
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
async def test_execute_node_long_output_kept_full(monkeypatch):
    # 超长输出不再破坏性截断：output 保留全文，供 write_workflow_candidate 落库完整正文
    long_chunk = "长" * 10000
    result, factory = await run_node(monkeypatch, {"chunks": [long_chunk]})
    assert result["success"] is True
    assert result["output"] == long_chunk
    assert "（中间省略）" not in result["output"]


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
    monkeypatch.setattr(we, "ModelFactory", should_not_construct)
    result = await wf.audit_node_output("短", "prompt", {})
    assert result == {"passed": True}


@pytest.mark.asyncio
async def test_audit_fail_prefix(monkeypatch):
    class FailAudit:
        async def ainvoke(self, m):
            return SimpleNamespace(content="FAIL 字数不足")
    monkeypatch.setattr(we, "ModelFactory", lambda cfg: SimpleNamespace(audit=FailAudit()))
    result = await wf.audit_node_output("这里是一段足够长的输出内容用于审计测试……" * 5, "要求", {})
    assert result["passed"] is False
    assert "FAIL" in result["reason"]


@pytest.mark.asyncio
async def test_audit_llm_exception_defaults_pass(monkeypatch):
    class BoomAudit:
        async def ainvoke(self, m):
            raise RuntimeError("boom")
    monkeypatch.setattr(we, "ModelFactory", lambda cfg: SimpleNamespace(audit=BoomAudit()))
    result = await wf.audit_node_output("足够长的输出内容用于触发审计逻辑。" * 20, "要求", {})
    assert result == {"passed": True}


@pytest.mark.asyncio
async def test_audit_pass_response(monkeypatch):
    class PassAudit:
        async def ainvoke(self, m): return SimpleNamespace(content="PASS 符合要求")
    monkeypatch.setattr(we, "ModelFactory", lambda cfg: SimpleNamespace(audit=PassAudit()))
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

    monkeypatch.setattr(we, "db_manager", SimpleNamespace(with_db=lambda: FakeWFDB(wf_workflow)))
    monkeypatch.setattr(we, "execute_node", fake_execute_node)

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


@pytest.mark.asyncio
async def test_run_workflow_emits_single_node_start_and_end(monkeypatch):
    """YEL-2 回归：node_start/node_end 由 execute_node 统一推送，run_workflow 不得重复发送。"""
    wf_workflow = SimpleNamespace(
        id="wf1",
        name="测试工作流",
        user_id=1,
        nodes=[
            {"id": "n1", "label": "节点1", "executor": "main", "system_prompt": "写正文"},
        ],
        edges=[],
    )
    events: list[dict] = []

    async def fake_execute_node(**kwargs):
        on_progress = kwargs.get("on_progress")
        if on_progress:
            on_progress({"event": "node_start", "node_id": "n1", "label": "节点1"})
            on_progress({"event": "node_stream", "node_id": "n1", "token": "内", "index": 1})
            on_progress({"event": "node_end", "node_id": "n1", "output_preview": "内容", "tokens": 1})
        return {"success": True, "output": "内容", "needs_review": False, "quality_check": {"passed": True}, "tokens": 1}

    monkeypatch.setattr(we, "db_manager", SimpleNamespace(with_db=lambda: FakeWFDB(wf_workflow)))
    monkeypatch.setattr(we, "execute_node", fake_execute_node)

    result = await wf.run_workflow(
        workflow_id="wf1",
        book_id=1,
        model_config={},
        on_progress=events.append,
    )
    assert result["status"] == "completed"
    kinds = [e["event"] for e in events]
    assert kinds.count("node_start") == 1
    assert kinds.count("node_end") == 1
    assert kinds.count("node_stream") == 1


@pytest.mark.asyncio
async def test_finish_with_candidate_uses_target_chapter_id():
    """YEL-5 回归：候选确认文案应显示真实章节号而非恒为"本章"。"""
    from domains.agent import workflow_runner_node as wrn

    result = {
        "status": "completed",
        "content_nodes": [
            {"node_id": "writer", "node_label": "执笔写手", "output": "正文", "summary": "正文摘要", "tokens": 5},
        ],
    }
    update = await wrn._finish_with_candidate(result, target_chapter_id=7)
    reply = update["messages"][0].content
    assert "第7章" in reply
    assert "候选1" in reply
    assert "本章" not in reply


# ---------------------------------------------------------------------------
# 节点级 RAG：rag_filter / rag_top_k 消费
# ---------------------------------------------------------------------------

class FakeEmbedding:
    def __init__(self, vector):
        self._vector = vector

    async def aembed_query(self, query):
        return self._vector


class FakeRagModelFactory:
    """假 ModelFactory：main/audit 正常生成，embedding 返回固定向量。"""

    def __init__(self, config: dict, vector=None):
        self.main = FakeStreamLLM(config.get("chunks") or ["RAG 增强输出"], raise_error=False)
        self.audit = FakeAuditLLM("PASS")
        self.embedding = FakeEmbedding(vector or [0.1, 0.2])


@pytest.mark.asyncio
async def test_query_node_rag_formats_results(monkeypatch):
    """节点 rag_filter 配置时执行向量检索并格式化为外部文档块。"""
    captured = {}

    class FakeVectorRepo:
        def __init__(self, session):
            captured["session"] = session
            self.session = session

        async def search_external_books(self, query_embedding, rag_filter, top_k):
            captured["rag_filter"] = rag_filter
            captured["top_k"] = top_k
            return [
                {"doc_title": "设定文档", "doc_author": "a", "content": "世界观核心内容", "distance": 0.1},
            ]

    monkeypatch.setattr(we, "ModelFactory", lambda cfg: FakeRagModelFactory({}, vector=[0.5, 0.5]))
    monkeypatch.setattr(
        "domains.knowledge.repository.VectorRepository",
        FakeVectorRepo,
    )
    node_def = {
        "id": "n1",
        "system_prompt": "根据知识库写设定",
        "rag_filter": {"query": "世界观", "doc_ids": ["1", "2"], "author_ids": ["5"], "sample": "设定"},
        "rag_top_k": 5,
    }
    embedding, rag_filter, top_k = await we._prepare_node_rag(node_def, {})
    text = await we._search_node_rag(embedding, rag_filter, top_k, object())
    assert "## 节点知识库检索结果" in text
    assert "世界观核心内容" in text
    assert rag_filter["query"] == "世界观"
    assert rag_filter["doc_ids"] == ["1", "2"]
    assert rag_filter["author_ids"] == ["5"]
    assert rag_filter["sample"] == "设定"
    assert top_k == 5


@pytest.mark.asyncio
async def test_query_node_rag_falls_back_to_system_prompt(monkeypatch):
    """未配置检索 query 时回退节点 system_prompt 作为语义查询。"""
    captured = {}

    class FakeVectorRepo:
        def __init__(self, session):
            self.session = session

        async def search_external_books(self, query_embedding, rag_filter, top_k):
            captured["query"] = rag_filter["query"]
            return []

    monkeypatch.setattr(we, "ModelFactory", lambda cfg: FakeRagModelFactory({}, vector=[0.5]))
    monkeypatch.setattr(
        "domains.knowledge.repository.VectorRepository",
        FakeVectorRepo,
    )
    node_def = {"id": "n1", "system_prompt": "你是设定考据师，检索世界观相关资料"}
    embedding, rag_filter, top_k = await we._prepare_node_rag(node_def, {})
    text = await we._search_node_rag(embedding, rag_filter, top_k, object())
    assert "你是设定考据师" in captured["query"]
    assert text == ""


@pytest.mark.asyncio
async def test_execute_node_injects_node_rag_context(monkeypatch):
    """execute_node 配置 rag_filter 时把检索结果注入 LLM 输入。"""
    from langchain_core.messages import HumanMessage

    seen_messages = {}

    class CollectingStreamLLM(FakeStreamLLM):
        async def astream(self, messages):
            seen_messages["human"] = next(
                (m.content for m in messages if isinstance(m, HumanMessage)), ""
            )
            for c in self._chunks:
                yield SimpleNamespace(content=c)

    class CollectingFactory:
        def __init__(self, config):
            self.main = CollectingStreamLLM(config.get("chunks") or ["正文输出"])
            self.audit = FakeAuditLLM("PASS")
            self.embedding = FakeEmbedding([0.5, 0.5])

    class RAGVectorRepo:
        def __init__(self, session):
            self.session = session

        async def search_external_books(self, query_embedding, rag_filter, top_k):
            return [
                {"doc_title": "检索文档", "doc_author": "a", "content": "检索到的内容", "distance": 0.1},
            ]

    monkeypatch.setattr(we, "ModelFactory", CollectingFactory)
    monkeypatch.setattr(
        "domains.knowledge.repository.VectorRepository",
        RAGVectorRepo,
    )

    async def _q(*a, **k):
        return {}

    monkeypatch.setattr(we, "_load_context_pool", _q)
    monkeypatch.setattr(we, "_query_structured_context", _q)

    result = await we.execute_node(
        node_def={
            "id": "n1",
            "system_prompt": "测试节点",
            "executor": "main",
            "rag_filter": {"query": "测试"},
            "rag_top_k": 3,
        },
        book_id=1,
        model_config={"chunks": ["正文输出"]},
        node_id="n1",
    )
    assert result["success"] is True
    assert "检索文档" in seen_messages["human"]
    assert "节点知识库检索结果" in seen_messages["human"]


# ---------------------------------------------------------------------------
# run_workflow：无 id 节点在拓扑重排后仍应进入 content_nodes 候选
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_workflow_unid_nodes_survive_topological_reorder(monkeypatch):
    """节点兜底 id 按原始 nodes 顺序解析，拓扑重排后候选集合仍能正确命中。

    _resolve_node_id 兜底（name/label/node-{idx}）按原始 nodes 顺序统一解析，
    即使 topological_sort 改变了执行顺序，content_nodes 候选也不会错配/遗漏。
    此处通过 mock topological_sort 输出重排顺序来验证。
    """
    nodes = [
        {"id": "nodeA", "executor": "main", "system_prompt": "写正文A"},
        {"id": "nodeB", "executor": "audit", "system_prompt": "审计"},
        {"id": "nodeC", "executor": "main", "system_prompt": "写正文C"},
    ]
    wf_workflow = SimpleNamespace(id="wf1", name="测试工作流", user_id=1, nodes=nodes, edges=[])
    # 模拟拓扑排序返回与原列表不同的顺序（nodeC 在前）
    monkeypatch.setattr(
        we, "topological_sort",
        lambda _nodes, _edges: [nodes[2], nodes[1], nodes[0]],
    )
    calls: list[dict] = []

    async def fake_execute_node(**kwargs):
        calls.append(kwargs)
        return {"success": True, "output": "正文", "needs_review": False, "quality_check": {"passed": True}, "tokens": 3}

    monkeypatch.setattr(we, "db_manager", SimpleNamespace(with_db=lambda: FakeWFDB(wf_workflow)))
    monkeypatch.setattr(we, "execute_node", fake_execute_node)

    result = await wf.run_workflow(
        workflow_id="wf1",
        book_id=1,
        model_config={},
        on_progress=lambda ev: None,
    )

    assert result["status"] == "completed"
    # 重排后执行顺序为 nodeC → nodeB → nodeA，但候选应只含 main 节点且 id 正确
    candidates = [n["node_id"] for n in result["content_nodes"]]
    assert set(candidates) == {"nodeA", "nodeC"}
    assert len(calls) == 3
