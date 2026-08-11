"""build_outline 工具测试（阶段一任务 1/2/5）。

覆盖：
- 数量护栏：卷≤5 / 章≤50 / 场景≤200，超限直接拒绝且不落库
- 成功路径：多卷 × 多章 × 多场景单事务创建、sort_order 递增、story_ts 缺省递增
- 字段截断：按列宽（Volume 100 / Chapter 200 / SceneEvent 200 / summary 500）
- 引用解析：character_names / plot_thread_names 按名解析、location_name 未命中自动新建、
  resolved_foreshadowing_titles 按伏笔描述子串匹配、未命中角色进 warnings
- 事务回滚：中途失败整体回滚（commit 不发生、rollback 被调用）
- update_entity 新增 kind：book / volume / creative_setting
- gating build_preview 聚合预览
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from domains.agent.tools_domain import _build_agent_tools
from domains.common.gating_service import build_preview
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
    """recompute_derived 替换为 no-op（派生一致性由生产路径真实 DB 负责）。"""

    async def _noop(session, book_id):
        return None

    from domains.agent.tools import book_tools

    monkeypatch.setattr(book_tools, "recompute_derived", _noop)


def make_book(**kw) -> Book:
    base = dict(id=1, title="测试之书", genre="奇幻", description="一本测试书", user_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_character(id: int, name: str = "", **kw):
    base = dict(id=id, name=name or f"角色{id}", role_type="主角", description="", user_id=1, book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_location(id: int, name: str = "", **kw):
    base = dict(id=id, name=name or f"地点{id}", type="城镇", description="", book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_foreshadowing(id: int, description: str = "", **kw):
    base = dict(id=id, description=description or f"伏笔描述{id}", status="planted", planted_at_chapter_id=1,
                resolved_at_chapter_id=None, related_event_id=None, book_id=1)
    return SimpleNamespace(**{**base, **kw})


def make_plot_thread(id: int, name: str = "", **kw):
    base = dict(id=id, name=name or f"线索{id}", type="main", description="", status="active",
                start_chapter_id=None, end_chapter_id=None, related_character_ids=[], book_id=1)
    return SimpleNamespace(**{**base, **kw})


def base_rows(overrides: dict | None = None):
    """空书籍 + 一组可引用的角色/地点/伏笔/线索（无现有卷章场景，便于断言新建）。"""
    rows = {
        Book: make_book(),
        Volume: [],
        Chapter: [],
        CreativeSetting: None,
        Character: [make_character(1, name="林晓"), make_character(2, name="陈默")],
        Location: [make_location(1, name="临江城")],
        Foreshadowing: [make_foreshadowing(1, description="城主府中的秘密")],
        PlotThread: [make_plot_thread(1, name="主线·夺位")],
        SceneEvent: [],
    }
    if overrides:
        rows.update(overrides)
    return rows


def get_tool(factory, rows: dict | None = None, model_config: dict | None = None):
    """构建 build_outline 工具实例。rows 为空时直接用 factory 已含的 rows。"""
    tools = _build_agent_tools(factory, model_config=model_config)
    tool = next(t for t in tools if t.name == "build_outline")
    return tool


def full_volumes() -> list[dict]:
    """1 卷 × 2 章 × 各 1 场景的合法输入，引用已有的角色/地点/线索/伏笔。"""
    return [
        {
            "title": "第一卷",
            "summary": "开篇",
            "chapters": [
                {
                    "title": "第一章 初入临江",
                    "summary": "主角抵达临江城",
                    "scene_events": [
                        {
                            "title": "入城",
                            "description": "城门口初见",
                            "location_name": "临江城",
                            "character_names": ["林晓", "陈默"],
                            "plot_thread_names": ["主线·夺位"],
                            "resolved_foreshadowing_titles": ["城主府中的秘密"],
                        }
                    ],
                },
                {"title": "第二章 夜探", "summary": "深夜探查", "scene_events": []},
            ],
        }
    ]


# ---------------------------------------------------------------------------
# 数量护栏
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_rejects_too_many_volumes(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    result = await tool.ainvoke({"volumes": [{"title": f"卷{i}"} for i in range(6)], "book_id": 1})
    assert "护栏" in result.get("error", "")
    assert result.get("guardrail") == "volumes<=5"
    assert factory.session.committed is False


@pytest.mark.asyncio
async def test_guard_rejects_too_many_chapters(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    vols = [{"title": "第一卷", "chapters": [{"title": f"第{i}章"} for i in range(51)]}]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert "护栏" in result.get("error", "")
    assert result.get("guardrail") == "chapters<=50"
    assert factory.session.committed is False


@pytest.mark.asyncio
async def test_guard_rejects_too_many_scene_events(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    vols = [{"title": "第一卷", "chapters": [{"title": "第一章", "scene_events": [{"title": f"场{i}"} for i in range(201)]}]}]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert "护栏" in result.get("error", "")
    assert result.get("guardrail") == "scene_events<=200"
    assert factory.session.committed is False


@pytest.mark.asyncio
async def test_guard_rejects_empty_volumes(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    result = await tool.ainvoke({"volumes": [], "book_id": 1})
    assert "volumes 不能为空" in result.get("error", "")


# ---------------------------------------------------------------------------
# 成功路径
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success_creates_volumes_chapters_events(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    result = await tool.ainvoke({"volumes": full_volumes(), "book_id": 1})

    assert result["volumes_created"] == 1
    assert result["chapters_created"] == 2
    assert result["events_created"] == 1
    assert result["locations_created"] == 0
    assert len(result["volume_ids"]) == 1
    assert len(result["chapter_ids"]) == 2
    assert len(result["event_ids"]) == 1
    assert factory.session.committed is True

    new_volumes = [o for o in factory.session.added if isinstance(o, Volume)]
    new_chapters = [o for o in factory.session.added if isinstance(o, Chapter)]
    new_events = [o for o in factory.session.added if isinstance(o, SceneEvent)]

    assert len(new_volumes) == 1
    assert new_volumes[0].sort_order == 1
    assert len(new_chapters) == 2
    assert [c.sort_order for c in new_chapters] == [1, 2]
    assert all(c.locked is False and c.generation_batch == 1 for c in new_chapters)
    assert len(new_events) == 1
    ev = new_events[0]
    assert ev.chapter_id == new_chapters[0].id
    assert ev.location_id == 1  # 按名称命中已有地点
    assert ev.character_ids == [1, 2]  # 按名称解析角色
    assert ev.plot_thread_ids == [1]  # 按名称解析线索
    assert ev.resolved_foreshadowing_ids == [1]  # 按描述子串匹配伏笔
    assert ev.story_ts > 0  # 缺省递增


@pytest.mark.asyncio
async def test_success_truncates_fields_by_column_width(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    vols = [{
        "title": "卷" * 150,
        "summary": "摘" * 600,
        "chapters": [{
            "title": "章" * 250,
            "summary": "摘" * 600,
            "scene_events": [{"title": "场" * 250, "description": "描" * 600}],
        }],
    }]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert result["events_created"] == 1
    new_volumes = [o for o in factory.session.added if isinstance(o, Volume)]
    new_chapters = [o for o in factory.session.added if isinstance(o, Chapter)]
    new_events = [o for o in factory.session.added if isinstance(o, SceneEvent)]
    assert len(new_volumes[0].title) == 100
    assert len(new_volumes[0].summary) == 500
    assert len(new_chapters[0].title) == 200
    assert len(new_chapters[0].summary) == 500
    assert len(new_events[0].title) == 200
    assert len(new_events[0].content) == 500


@pytest.mark.asyncio
async def test_success_creates_new_location_and_warns_on_missing_character(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    vols = [{
        "title": "第一卷",
        "chapters": [{
            "title": "第一章",
            "scene_events": [{
                "title": "新场景",
                "location_name": "未登记村庄",
                "location_type": "村落",
                "character_names": ["林晓", "不存在的人"],
            }],
        }],
    }]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert result["locations_created"] == 1
    assert result["events_created"] == 1
    assert any("不存在的人" in w for w in result.get("warnings", []))
    new_locs = [o for o in factory.session.added if isinstance(o, Location)]
    assert len(new_locs) == 1
    assert new_locs[0].type == "村落"
    ev = [o for o in factory.session.added if isinstance(o, SceneEvent)][0]
    assert ev.location_id == new_locs[0].id
    assert ev.character_ids == [1]


@pytest.mark.asyncio
async def test_success_dedupes_location_by_name_within_call(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tool = get_tool(factory)
    vols = [{
        "title": "第一卷",
        "chapters": [{
            "title": "第一章",
            "scene_events": [
                {"title": "场一", "location_name": "新村庄"},
                {"title": "场二", "location_name": "新村庄"},
            ],
        }],
    }]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert result["locations_created"] == 1
    new_locs = [o for o in factory.session.added if isinstance(o, Location)]
    assert len(new_locs) == 1
    events = [o for o in factory.session.added if isinstance(o, SceneEvent)]
    assert events[0].location_id == events[1].location_id


# ---------------------------------------------------------------------------
# 事务回滚
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rollback_on_midway_failure(fake_session_factory, monkeypatch):
    """flush 第 2 个对象时抛异常 → 整体回滚：commit 不发生、rollback 被调用、返回错误。"""

    class _Result:
        def __init__(self, scalars=None, one=None, scalar=None):
            self._scalars = scalars or []
            self._one = one
            self._scalar = scalar if scalar is not None else (one if one is not None else None)

        def scalar(self):
            return self._scalar

        def scalar_one_or_none(self):
            return self._one

        def scalars(self):
            return self

        def all(self):
            return self._scalars

    class FailingSession:
        def __init__(self, rows: dict):
            self.rows = rows
            self.added: list = []
            self.committed = False
            self.rolled_back = False
            self._id_counter = 1000

        async def execute(self, stmt):
            entity = None
            for f in stmt.get_final_froms():
                if getattr(f, "__table__", None) is not None:
                    entity = f
                    break
                for mapper in Book.registry.mappers:
                    if mapper.local_table is f:
                        entity = mapper.class_
                        break
                if entity is not None:
                    break
            value = self.rows.get(entity)
            if isinstance(value, list):
                return _Result(scalars=value)
            return _Result(one=value, scalar=value)

        def add(self, obj):
            self.added.append(obj)

        async def flush(self):
            if len(self.added) >= 2:
                raise RuntimeError("模拟数据库约束冲突")
            for obj in self.added:
                if getattr(obj, "id", None) is None:
                    obj.id = self._id_counter
                    self._id_counter += 1

        async def commit(self):
            self.committed = True

        async def rollback(self):
            self.rolled_back = True

    class _CM:
        def __init__(self, session):
            self._session = session

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, *args):
            return False

    session = FailingSession(base_rows())
    tools = _build_agent_tools(lambda: _CM(session), model_config=None)
    tool = next(t for t in tools if t.name == "build_outline")
    vols = [{
        "title": "第一卷",
        "chapters": [
            {"title": "第一章", "scene_events": [{"title": "场一"}]},
            {"title": "第二章", "scene_events": [{"title": "场二"}]},
        ],
    }]
    result = await tool.ainvoke({"volumes": vols, "book_id": 1})
    assert "已回滚" in result.get("error", "")
    assert session.committed is False
    assert session.rolled_back is True


# ---------------------------------------------------------------------------
# update_entity 新增 kind
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_entity_book(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tools = _build_agent_tools(factory, model_config=None)
    tool = next(t for t in tools if t.name == "update_entity")
    result = await tool.ainvoke({"kind": "book", "item_id": 1, "data": {"title": "新书名", "total_word_goal": 100000}, "book_id": 1, "user_id": 1})
    assert result["kind"] == "book"
    assert result["updated"] == {"title": "新书名", "total_word_goal": 100000}


@pytest.mark.asyncio
async def test_update_entity_volume(fake_session_factory):
    rows = base_rows({Volume: [SimpleNamespace(id=1, book_id=1, title="第一卷", summary="")]})
    factory = fake_session_factory(rows)
    tools = _build_agent_tools(factory, model_config=None)
    tool = next(t for t in tools if t.name == "update_entity")
    result = await tool.ainvoke({"kind": "volume", "item_id": 1, "data": {"title": "改名卷"}, "book_id": 1, "user_id": 1})
    assert result["kind"] == "volume"
    assert result["updated"] == {"title": "改名卷"}


@pytest.mark.asyncio
async def test_update_entity_creative_setting_creates_if_missing(fake_session_factory):
    factory = fake_session_factory(base_rows())
    tools = _build_agent_tools(factory, model_config=None)
    tool = next(t for t in tools if t.name == "update_entity")
    result = await tool.ainvoke({
        "kind": "creative_setting", "item_id": 0,
        "data": {"tone": "黑暗风", "worldview": "修真世界"}, "book_id": 1, "user_id": 1,
    })
    assert result["kind"] == "creative_setting"
    assert result["updated"] == {"tone": "黑暗风", "worldview": "修真世界"}
    assert factory.session.committed is True


# ---------------------------------------------------------------------------
# gating build_preview 聚合预览
# ---------------------------------------------------------------------------


def test_build_preview_aggregate():
    args = {"volumes": [
        {"title": "第一卷", "chapters": [{"title": "第一章", "scene_events": [{"title": "a"}, {"title": "b"}]}, {"title": "第二章", "scene_events": []}]},
        {"title": "第二卷", "chapters": [{"title": "第三章", "scene_events": []}]},
    ]}
    preview = build_preview("outline.create", "build_outline", args)
    assert "2 卷" in preview["output_preview"]
    assert "3 章" in preview["output_preview"]
    assert "2 个场景事件" in preview["output_preview"]
    assert "第一卷" in preview["output_preview"]
    assert preview["node_id"] == "build_outline"


def test_build_preview_truncates_long_volume_list():
    vols = [{"title": f"第{i}卷", "chapters": []} for i in range(15)]
    preview = build_preview("outline.create", "build_outline", {"volumes": vols})
    assert "15 卷" in preview["output_preview"]
    assert "其余 5 卷略" in preview["output_preview"]
