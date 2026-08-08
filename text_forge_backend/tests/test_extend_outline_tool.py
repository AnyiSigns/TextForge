"""extend_outline_tool 测试。

覆盖：
- 辅助函数：批次号 / sort_order 计算
- 全部 7 个失败分支（未选书籍、书籍不存在、无卷、有卷无章、模型未配置、AI 输出不可解析、无章节数据）
- 成功路径：章节/事件创建、标题摘要截断、批次递增、线索完结、伏笔回收
- 卷满 20 章自动切新卷

所有测试均使用假会话与假 LLM，不依赖真实数据库和 API key。
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from domains.agent.tools import extend_outline_tool as tool_mod
from models.book import (
    Book,
    Chapter,
    Character,
    CreativeSetting,
    Foreshadowing,
    Location,
    PlotThread,
    SceneEvent,
    Volume,
)


@pytest.fixture(autouse=True)
def _patch_recompute(monkeypatch):
    """将 recompute_derived 替换为 no-op。

    fake session 的查询不包含运行时新建的事件对象，recompute_derived 基于
    静态 rows 重算会覆盖本工具直接写入的 end/resolved 派生值，干扰本文件
    对工具自身逻辑的断言。派生重算的一致性由生产路径（真实 DB）负责。
    """

    async def _noop(session, book_id):
        return None

    monkeypatch.setattr(tool_mod, "recompute_derived", _noop)

# ---------------------------------------------------------------------------
# 测试对象构造辅助
# ---------------------------------------------------------------------------


def make_book(**kw) -> Book:
    base = dict(id=1, title="测试之书", genre="奇幻", description="一本测试书", user_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_volume(id: int, sort_order: int = 1, **kw) -> Volume:
    base = dict(id=id, book_id=1, title=f"第{sort_order}卷", sort_order=sort_order)
    return SimpleNamespace(**{**base, **kw})


def make_chapter(id: int, volume_id: int = 1, sort_order: int = 1, generation_batch: int = 1, **kw) -> Chapter:
    base = dict(id=id, volume_id=volume_id, title=f"第{sort_order}章", summary="", sort_order=sort_order,
                locked=False, generation_batch=generation_batch)
    return SimpleNamespace(**{**base, **kw})


def make_character(id: int, **kw):
    base = dict(id=id, name=f"角色{id}", role_type="主角", description="", user_id=1, book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_location(id: int, **kw):
    base = dict(id=id, name=f"地点{id}", type="town", description="", book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_foreshadowing(id: int, status: str = "planted", resolved_at_chapter_id=None, **kw):
    base = dict(id=id, description="伏笔描述", status=status, planted_at_chapter_id=1,
                resolved_at_chapter_id=resolved_at_chapter_id, related_event_id=None, book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_plot_thread(id: int, status: str = "active", end_chapter_id=None, **kw):
    base = dict(id=id, name=f"线索{id}", type="main", description="", status=status,
                start_chapter_id=None, end_chapter_id=end_chapter_id, related_character_ids=[], book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_scene_event(id: int, story_ts: float = 0.0, story_label: str = "", **kw):
    base = dict(id=id, book_id=1, chapter_id=1, title=f"事件{id}", description="", content="", sort_order=1,
                event_type="scene", story_ts=story_ts, story_label=story_label, location_id=None,
                character_ids=[], plot_thread_ids=[], resolved_foreshadowing_ids=[], completed_plot_thread_ids=[])
    return SimpleNamespace(**{**base, **kw})


def make_creative(**kw):
    base = dict(book_id=1, tone=None, worldview=None)
    return SimpleNamespace(**{**base, **kw})


def base_rows(overrides: dict | None = None):
    """一套完整可用的数据集（book + 1 卷 + 2 章 + 角色/地点/伏笔/线索/事件）。

    注意：overrides 必须用实体类作 key（如 {Volume: [], Chapter: []}），
    不能用关键字参数——kwargs 的 key 是字符串，无法覆盖类 key。
    """
    rows = {
        Book: make_book(),
        Volume: [make_volume(1)],
        Chapter: [make_chapter(1, sort_order=1), make_chapter(2, sort_order=2)],
        CreativeSetting: None,
        Character: [make_character(1), make_character(2)],
        Location: [make_location(1)],
        Foreshadowing: [make_foreshadowing(1)],
        PlotThread: [make_plot_thread(1)],
        SceneEvent: [make_scene_event(1)],
    }
    if overrides:
        rows.update(overrides)
    return rows


def llm_json(chapters: list[dict]) -> str:
    """构造合法 LLM JSON 输出字符串。"""
    return json.dumps({"chapters": chapters, "new_volume_needed": False}, ensure_ascii=False)


def valid_chapters_json() -> str:
    """两章合法输出：含事件、线索完结、伏笔回收。"""
    return llm_json([
        {
            "title": "第3章 风起", "summary": "主角踏上旅途",
            "scene_events": [
                {"name": "出发", "description": "离开小镇", "event_type": "scene",
                 "story_label": "第二天", "location_id": 1, "character_ids": [1], "plot_thread_ids": [1]}
            ],
            "thread_updates": [{"thread_id": 1, "end_chapter": True}],
            "foreshadowing_updates": [{"foreshadowing_id": 1, "resolved": True}],
        },
        {"title": "第4章 转折", "summary": "遭遇强敌", "scene_events": [],
         "thread_updates": [], "foreshadowing_updates": []},
    ])


def make_tool(fake_session_factory, rows: dict, model_config: dict | None):
    """构建工具实例。"""
    factory = fake_session_factory(rows)
    tool = tool_mod.build_extend_outline_tool(factory, model_config)
    return tool, factory.session


# ---------------------------------------------------------------------------
# 辅助函数：批次号 / sort_order
# ---------------------------------------------------------------------------

class ScalarSession:
    """只支持 scalar() 结果的极简假会话（聚合查询用）。"""

    def __init__(self, value):
        self._value = value

    async def execute(self, stmt):
        return SimpleNamespace(scalar=lambda: self._value, scalars=lambda: SimpleNamespace(all=list),
                               scalar_one_or_none=lambda: None)


@pytest.mark.asyncio
async def test_next_batch_no_chapters_returns_1():
    session = ScalarSession(None)
    assert await tool_mod._get_next_batch_number(session, 1) == 1


@pytest.mark.asyncio
async def test_next_batch_increments_max():
    session = ScalarSession(3)
    assert await tool_mod._get_next_batch_number(session, 1) == 4


@pytest.mark.asyncio
async def test_last_sort_order_empty_returns_0():
    session = ScalarSession(None)
    assert await tool_mod._get_last_sort_order(session, 1) == 0


@pytest.mark.asyncio
async def test_last_sort_order_returns_max():
    session = ScalarSession(7)
    assert await tool_mod._get_last_sort_order(session, 1) == 7


@pytest.mark.asyncio
async def test_last_scene_event_sort_order_returns_max():
    session = ScalarSession(2)
    assert await tool_mod._get_last_scene_event_sort_order(session, 1) == 2


# ---------------------------------------------------------------------------
# 失败分支
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_error_when_book_id_zero(fake_session_factory):
    tool, session = make_tool(fake_session_factory, {}, None)
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 0})
    assert result == {"status": "error", "message": "未选择活动书籍"}


@pytest.mark.asyncio
async def test_error_when_book_not_found(fake_session_factory, fake_model_factory):
    tool, session = make_tool(fake_session_factory, {Book: None}, {"response": "x"})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 99, "user_id": 1})
    assert result == {"status": "error", "message": "书籍不存在"}


@pytest.mark.asyncio
async def test_error_when_no_volumes(fake_session_factory, fake_model_factory):
    rows = base_rows({Volume: [], Chapter: []})
    tool, session = make_tool(fake_session_factory, rows, {"response": "x"})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result == {"status": "error", "message": "请先初始化书籍大纲（创建至少一卷一章）"}


@pytest.mark.asyncio
async def test_error_when_no_chapters(fake_session_factory, fake_model_factory):
    rows = base_rows({Chapter: []})
    tool, session = make_tool(fake_session_factory, rows, {"response": "x"})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result == {"status": "error", "message": "请先初始化书籍大纲"}


@pytest.mark.asyncio
async def test_error_when_model_not_configured(fake_session_factory):
    tool, session = make_tool(fake_session_factory, base_rows(), None)
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result == {"status": "error", "message": "模型未配置"}


@pytest.mark.asyncio
async def test_error_when_llm_output_unparsable(fake_session_factory, fake_model_factory):
    rows = base_rows()
    tool, session = make_tool(fake_session_factory, rows, {"response": "这不是 JSON"})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result == {"status": "error", "message": "大纲生成失败：无法解析 AI 输出"}
    # 失败路径不应落库
    assert session.committed is False


@pytest.mark.asyncio
async def test_error_when_llm_output_missing_chapters(fake_session_factory, fake_model_factory):
    rows = base_rows()
    tool, session = make_tool(fake_session_factory, rows, {"response": '{"foo": 1}'})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result == {"status": "error", "message": "大纲生成失败：无章节数据"}


# ---------------------------------------------------------------------------
# 成功路径
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_success_creates_chapters_and_events(fake_session_factory, fake_model_factory, monkeypatch):
    rows = base_rows()

    async def fake_next_batch(session, book_id):
        return 2

    async def fake_last_sort(session, volume_id):
        return 2

    monkeypatch.setattr(tool_mod, "_get_next_batch_number", fake_next_batch)
    monkeypatch.setattr(tool_mod, "_get_last_sort_order", fake_last_sort)

    tool, session = make_tool(fake_session_factory, rows, {"response": valid_chapters_json()})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})

    assert result["status"] == "completed"
    assert result["chapters_created"] == 2
    assert result["events_created"] == 1
    assert result["generation_batch"] == 2
    assert result["new_chapter_count"] == 4
    assert session.committed is True

    # 新章节：标题、摘要、排序、批次
    new_chapters = [o for o in session.added if isinstance(o, Chapter)]
    assert len(new_chapters) == 2
    assert [c.sort_order for c in new_chapters] == [3, 4]
    assert all(c.generation_batch == 2 for c in new_chapters)
    assert new_chapters[0].title == "第3章 风起"

    # 场景事件关联正确
    new_events = [o for o in session.added if isinstance(o, SceneEvent)]
    assert len(new_events) == 1
    assert new_events[0].chapter_id == new_chapters[0].id
    assert new_events[0].location_id == 1
    assert new_events[0].character_ids == [1]
    assert new_events[0].plot_thread_ids == [1]
    assert new_events[0].story_ts == 0.0  # last_story_ts=0 + (0*10+0)

    # 线索完结 + 伏笔回收（修改的是传入 rows 中的同一对象）
    thread = rows[PlotThread][0]
    assert thread.end_chapter_id == new_chapters[0].id
    assert thread.status == "completed"
    foreshadow = rows[Foreshadowing][0]
    assert foreshadow.resolved_at_chapter_id == new_chapters[0].id
    assert foreshadow.status == "resolved"


@pytest.mark.asyncio
async def test_success_with_code_block_wrapped_json(fake_session_factory, fake_model_factory, monkeypatch):
    # 回归测试：LLM 输出带 markdown 代码块包裹 + 深层嵌套时也能正确提取（原正则只支持一层嵌套）
    wrapped = "```json\n" + valid_chapters_json() + "\n```"

    async def fake_next_batch(session, book_id):
        return 2

    async def fake_last_sort(session, volume_id):
        return 2

    monkeypatch.setattr(tool_mod, "_get_next_batch_number", fake_next_batch)
    monkeypatch.setattr(tool_mod, "_get_last_sort_order", fake_last_sort)

    tool, session = make_tool(fake_session_factory, base_rows(), {"response": wrapped})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result["status"] == "completed"
    assert result["chapters_created"] == 2


@pytest.mark.asyncio
async def test_success_truncates_title_and_summary(fake_session_factory, fake_model_factory):
    long_title = "长" * 300
    long_summary = "摘" * 700
    response = llm_json([{"title": long_title, "summary": long_summary, "scene_events": []}])
    tool, session = make_tool(fake_session_factory, base_rows(), {"response": response})
    result = await tool.ainvoke({"chapter_count": 1, "book_id": 1, "user_id": 1})
    assert result["status"] == "completed"
    new_chapter = [o for o in session.added if isinstance(o, Chapter)][0]
    assert len(new_chapter.title) == 200
    assert len(new_chapter.summary) == 500


@pytest.mark.asyncio
async def test_volume_rotation_when_last_volume_full(fake_session_factory, fake_model_factory, monkeypatch):
    # 第 1 卷已满 20 章 → 追加时自动创建第 2 卷
    v1 = make_volume(1, sort_order=1)
    existing = [make_chapter(i, volume_id=1, sort_order=i) for i in range(1, 21)]
    rows = base_rows({Volume: [v1], Chapter: existing})

    async def fake_next_batch(session, book_id):
        return 3

    monkeypatch.setattr(tool_mod, "_get_next_batch_number", fake_next_batch)

    tool, session = make_tool(fake_session_factory, rows, {"response": valid_chapters_json()})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result["status"] == "completed"

    # 新卷被创建：sort_order=2
    new_volumes = [o for o in session.added if isinstance(o, Volume)]
    assert len(new_volumes) == 1
    new_vol = new_volumes[0]
    assert new_vol.sort_order == 2
    assert new_vol.book_id == 1

    # 新章节进入新卷，排序从 1 重新开始
    new_chapters = [o for o in session.added if isinstance(o, Chapter)]
    assert len(new_chapters) == 2
    assert all(c.volume_id == new_vol.id for c in new_chapters)
    assert [c.sort_order for c in new_chapters] == [1, 2]
    assert all(c.generation_batch == 3 for c in new_chapters)


@pytest.mark.asyncio
async def test_success_without_threads_or_foreshadowings(fake_session_factory, fake_model_factory, monkeypatch):
    # 无进行中线索 / 无未回收伏笔时也能正常追加
    rows = base_rows({
        Foreshadowing: [make_foreshadowing(1, status="resolved", resolved_at_chapter_id=1)],
        PlotThread: [make_plot_thread(1, status="completed", end_chapter_id=1)],
    })

    async def fake_next_batch(session, book_id):
        return 2

    async def fake_last_sort(session, volume_id):
        return 2

    monkeypatch.setattr(tool_mod, "_get_next_batch_number", fake_next_batch)
    monkeypatch.setattr(tool_mod, "_get_last_sort_order", fake_last_sort)

    tool, session = make_tool(fake_session_factory, rows, {"response": valid_chapters_json()})
    result = await tool.ainvoke({"chapter_count": 2, "book_id": 1, "user_id": 1})
    assert result["status"] == "completed"
    assert result["chapters_created"] == 2
