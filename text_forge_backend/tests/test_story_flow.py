"""剧情流服务层单元测试：两段式解析容错、决策链截断、幂等创建、
advance 幂等、complete 摘要失败回退。不依赖真实数据库/LLM。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from domains.story_flow import service
from domains.story_flow.repository import flow_to_dict, node_to_dict
from models.book import Book, Chapter, SceneEvent
from models.story_flow import StoryFlow, StoryFlowNode

# ── 假会话：支持 execute（按实体分发）+ get（按 id 查询）──

class FakeResult:
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


class FakeSession:
    """rows: {实体类: 值(list→scalars.all / 其他→scalar_one_or_none)}；
    by_id: {实体类: {id: obj}} 供 session.get 使用。"""

    def __init__(self, rows=None, by_id=None):
        self.rows = rows or {}
        self.by_id = by_id or {}
        self.added = []
        self.committed = False
        self.rolled_back = False
        self._id_counter = 1000

    def _entity_of(self, stmt):
        from models.book import Base

        for f in stmt.get_final_froms():
            table = getattr(f, "__table__", None)
            if table is not None:
                return f
            for mapper in Base.registry.mappers:
                if mapper.local_table is f:
                    return mapper.class_
        return None

    async def execute(self, stmt):
        entity = self._entity_of(stmt)
        value = self.rows.get(entity)
        if isinstance(value, list):
            return FakeResult(scalars=value)
        return FakeResult(one=value, scalar=value)

    async def get(self, cls, id):
        by_id = self.by_id.get(cls) or {}
        return by_id.get(id)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._id_counter
                self._id_counter += 1

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class FakeLLM:
    """astream 逐 chunk 返回输出片段。"""

    def __init__(self, chunks):
        self.chunks = chunks

    async def astream(self, messages):
        for c in self.chunks:
            yield SimpleNamespace(content=c)

    async def ainvoke(self, messages):
        return SimpleNamespace(content="".join(self.chunks))


def make_book(chapter_id=1) -> Book:
    book = Book(id=1, user_id=1, title="测试之书", genre="玄幻", description="测试简介")
    return book


def make_chapter() -> Chapter:
    chapter = Chapter(id=1, volume_id=1, title="第一章", summary="章节摘要", sort_order=0, locked=False)
    return chapter


def make_event(id=100, title="密室觉醒") -> SceneEvent:
    event = SceneEvent(
        id=id,
        book_id=1,
        chapter_id=1,
        title=title,
        content="林星辰在密室中发现星图。",
        sort_order=0,
        event_type="event",
        story_ts=0,
        character_ids=[],
        locked=False,
    )
    return event


def make_flow(with_nodes=True) -> StoryFlow:
    flow = StoryFlow(
        id=10,
        book_id=1,
        chapter_id=1,
        user_id=1,
        status="active",
        anchor_event_ids=[100],
        current_event_index=0,
        view_character_id=None,
        round_count=0,
    )
    return flow


def make_node(seq=1, chosen=None, title="密室觉醒", narration="叙事文本", anchored=100) -> StoryFlowNode:
    return StoryFlowNode(
        id=seq * 100,
        flow_id=10,
        seq=seq,
        title=title,
        narration=narration,
        options=[{"text": "选项一"}] if not chosen else [{"text": "选项一"}, {"text": "选项二"}],
        chosen_option=chosen,
        anchored_event_id=anchored,
    )


# ── 两段式输出解析容错 ──

def test_split_two_phase_standard():
    text = "密室中烛火摇曳。\n###OPTIONS###\n[{\"text\":\"仔细研究\"},{\"text\":\"退出密室\"}]"
    narration, options = service._split_two_phase(text)
    assert narration == "密室中烛火摇曳。"
    assert options == [{"text": "仔细研究"}, {"text": "退出密室"}]


def test_split_two_phase_no_marker_fallback():
    text = "整段都是叙事，没有选项分隔符。"
    narration, options = service._split_two_phase(text)
    assert narration == text
    assert options == service.DEFAULT_OPTIONS


def test_parse_options_json_fence_wrapper():
    tail = '```json\n[{"text":"选项A"},{"text":"选项B"}]\n```'
    options = service._parse_options(tail)
    assert options == [{"text": "选项A"}, {"text": "选项B"}]


def test_parse_options_trailing_prose():
    tail = '叙事尾巴[{"text":"选项X"}]更多废话'
    options = service._parse_options(tail)
    assert options == [{"text": "选项X"}]


def test_parse_options_empty_array_natural_end():
    assert service._parse_options("[]") == []
    assert service._parse_options('[{"text":""}]') == []


def test_parse_options_garbage_fallback():
    assert service._parse_options("这不是JSON") == service.DEFAULT_OPTIONS


def test_parse_options_bad_items_filtered():
    tail = '[{"text":"有效"},{"foo":"无text"}]'
    assert service._parse_options(tail) == [{"text": "有效"}]


# ── 决策链历史截断 ──

def test_build_decision_history_window_truncation():
    nodes = [
        make_node(seq=i, chosen=f"选择{i}", title=f"场景{i}", narration=f"叙事{i}" * 40)
        for i in range(1, 9)
    ]
    text = service._build_decision_history(nodes)
    assert "此前共 2 幕" in text
    # 最近的节点完整保留
    assert "【第8幕·场景8】" in text
    assert "（选择：选择8）" in text


def test_build_decision_history_empty():
    assert service._build_decision_history([]) == "（推演刚开始）"


# ── 幂等创建：已有 active 流且有节点 → 直接回放，不调 LLM ──

@pytest.mark.asyncio
async def test_stream_create_flow_reuses_existing_with_nodes(monkeypatch):
    existing = make_flow()
    node = make_node(seq=1, chosen="选项一")
    session = FakeSession(
        rows={StoryFlow: existing, StoryFlowNode: [node]},
        by_id={StoryFlow: {10: existing}, StoryFlowNode: {100: node}},
    )

    called = {"generated": False}
    async def fake_generate(**kwargs):
        called["generated"] = True
        yield {"type": "scene_stream", "token": "x"}

    monkeypatch.setattr(service, "_generate_scene_node", fake_generate)

    events = [e async for e in service.stream_create_flow(
        session=session,
        book=make_book(),
        chapter=make_chapter(),
        view_character_id=None,
        user_id=1,
        model_config={"main_config": {}},
    )]

    assert not called["generated"]
    types = [e["type"] for e in events]
    assert types == ["scene_done", "done"]
    assert events[0]["node"]["seq"] == 1
    assert events[0]["completed"] is False


# ── advance 幂等：最后节点已有后续节点 → 回放不重新生成 ──

@pytest.mark.asyncio
async def test_stream_advance_flow_idempotent_replay(monkeypatch):
    flow = make_flow()
    node1 = make_node(seq=1, chosen="选项一")
    node2 = make_node(seq=2, chosen=None, title="第二幕", narration="第二幕叙事")
    session = FakeSession(
        rows={StoryFlow: flow, StoryFlowNode: [node1, node2]},
        by_id={StoryFlow: {10: flow}, StoryFlowNode: {100: node1, 200: node2}},
    )

    async def fake_get_last_node(s, flow_id):
        return node1

    async def fake_get_node_by_seq(s, flow_id, seq):
        return node2 if seq == 2 else None

    monkeypatch.setattr(service.repo, "get_last_node", fake_get_last_node)
    monkeypatch.setattr(service.repo, "get_node_by_seq", fake_get_node_by_seq)

    called = {"generated": False}
    async def fake_generate(**kwargs):
        called["generated"] = True
        yield {"type": "scene_stream", "token": "x"}

    monkeypatch.setattr(service, "_generate_scene_node", fake_generate)

    events = [e async for e in service.stream_advance_flow(
        session=session,
        flow=flow,
        chosen_option_text="选项一",
        model_config={"main_config": {}},
    )]

    assert not called["generated"]
    assert [e["type"] for e in events] == ["scene_done", "done"]
    assert events[0]["node"]["seq"] == 2
    # 回放不改写结果节点的选择（防止把上次的选择文本误写到节点上）
    assert node2.chosen_option is None


@pytest.mark.asyncio
async def test_stream_advance_flow_replay_before_write(monkeypatch):
    """回放优先：即使最后节点无选择，只要存在后续节点就回放，不写入新选择。"""
    flow = make_flow()
    node2 = make_node(seq=2, chosen=None, title="第二幕")
    node3 = make_node(seq=3, chosen=None, title="第三幕")
    session = FakeSession(
        rows={StoryFlow: flow, StoryFlowNode: [node2, node3]},
        by_id={StoryFlow: {10: flow}, StoryFlowNode: {200: node2, 300: node3}},
    )

    async def fake_get_last_node(s, flow_id):
        return node2

    async def fake_get_node_by_seq(s, flow_id, seq):
        return node3 if seq == 3 else None

    monkeypatch.setattr(service.repo, "get_last_node", fake_get_last_node)
    monkeypatch.setattr(service.repo, "get_node_by_seq", fake_get_node_by_seq)

    called = {"generated": False}
    async def fake_generate(**kwargs):
        called["generated"] = True
        yield {"type": "scene_stream", "token": "x"}

    monkeypatch.setattr(service, "_generate_scene_node", fake_generate)

    events = [e async for e in service.stream_advance_flow(
        session=session,
        flow=flow,
        chosen_option_text="选项一",
        model_config={"main_config": {}},
    )]

    assert not called["generated"]
    assert [e["type"] for e in events] == ["scene_done", "done"]
    assert events[0]["node"]["seq"] == 3
    assert node2.chosen_option is None


# ── 事件序列末尾 → 追加收尾幕；收尾幕已生成 → 自动完成 ──

@pytest.mark.asyncio
async def test_stream_advance_flow_generates_closing_at_sequence_end(monkeypatch):
    """全部事件推演完（current_event_index == len）→ 生成收尾幕（closing=True）。"""
    flow = make_flow()
    flow.current_event_index = 1  # 事件共 1 个，已全部推演完
    node1 = make_node(seq=1, chosen="选项一")
    session = FakeSession(
        rows={StoryFlow: flow, StoryFlowNode: [node1]},
        by_id={
            StoryFlow: {10: flow},
            StoryFlowNode: {100: node1},
            Book: {1: make_book()},
            Chapter: {1: make_chapter()},
        },
    )

    async def fake_get_last_node(s, flow_id):
        return node1

    async def fake_get_node_by_seq(s, flow_id, seq):
        return None

    monkeypatch.setattr(service.repo, "get_last_node", fake_get_last_node)
    monkeypatch.setattr(service.repo, "get_node_by_seq", fake_get_node_by_seq)

    called = {"kwargs": None}
    async def fake_generate(**kwargs):
        called["kwargs"] = kwargs
        yield {"type": "scene_stream", "token": "x"}

    monkeypatch.setattr(service, "_generate_scene_node", fake_generate)

    events = [e async for e in service.stream_advance_flow(
        session=session,
        flow=flow,
        chosen_option_text="选项一",
        model_config={"main_config": {}},
    )]

    assert called["kwargs"] is not None
    assert called["kwargs"]["index"] == -1
    assert called["kwargs"]["closing"] is True
    assert [e["type"] for e in events] == ["scene_stream"]


@pytest.mark.asyncio
async def test_stream_advance_flow_completes_after_closing(monkeypatch):
    """收尾幕已生成（最后节点无锚点）→ advance 直接 completed，不再生成。"""
    flow = make_flow()
    flow.current_event_index = 1
    closing_node = make_node(seq=2, chosen=None, title="收尾", anchored=None)
    session = FakeSession(
        rows={StoryFlow: flow, StoryFlowNode: [closing_node]},
        by_id={
            StoryFlow: {10: flow},
            StoryFlowNode: {200: closing_node},
            Book: {1: make_book()},
            Chapter: {1: make_chapter()},
        },
    )

    async def fake_get_last_node(s, flow_id):
        return closing_node

    async def fake_get_node_by_seq(s, flow_id, seq):
        return None

    monkeypatch.setattr(service.repo, "get_last_node", fake_get_last_node)
    monkeypatch.setattr(service.repo, "get_node_by_seq", fake_get_node_by_seq)

    called = {"generated": False}
    async def fake_generate(**kwargs):
        called["generated"] = True
        yield {"type": "scene_stream", "token": "x"}

    monkeypatch.setattr(service, "_generate_scene_node", fake_generate)

    events = [e async for e in service.stream_advance_flow(
        session=session,
        flow=flow,
        chosen_option_text="选项一",
        model_config={"main_config": {}},
    )]

    assert not called["generated"]
    assert [e["type"] for e in events] == ["scene_done", "done"]
    assert events[0]["node"] is None
    assert events[0]["completed"] is True
    assert flow.status == "completed"


# ── 场景节点生成：两段式流式 → scene_stream + scene_done ──

@pytest.mark.asyncio
async def test_generate_scene_node_two_phase_stream(monkeypatch):
    flow = make_flow()
    event = make_event()
    session = FakeSession(
        rows={
            StoryFlow: flow,
            StoryFlowNode: [],
            SceneEvent: [event],
            Book: make_book(),
            Chapter: make_chapter(),
        },
        by_id={Book: {1: make_book()}, Chapter: {1: make_chapter()}},
    )

    def fake_model_factory(config):
        return SimpleNamespace(
            main=FakeLLM([
                "密室内烛火摇曳，林星辰的手指触到泛黄的星图。",
                "###OPTIONS###",
                '[{"text":"仔细研究","x":1},{"text":"退出密室"}]',
            ])
        )

    monkeypatch.setattr(service, "ModelFactory", fake_model_factory)

    events = [e async for e in service._generate_scene_node(
        session=session,
        flow=flow,
        book=make_book(),
        chapter=make_chapter(),
        model_config={"main_config": {}},
        seq=1,
        index=0,
        view_character_id=None,
    )]

    types = [e["type"] for e in events]
    assert types == ["scene_stream", "scene_done", "done"]
    assert "烛火摇曳" in events[0]["token"]
    node = events[1]["node"]
    assert node["title"] == "密室觉醒"  # 由锚点事件派生，非 LLM
    assert node["anchoredEventId"] == 100
    assert node["options"] == [{"text": "仔细研究"}, {"text": "退出密室"}]
    assert "林星辰" in node["narration"]
    assert flow.round_count == 1


# ── 多幕机制：###MORE### 续幕 / 第 3 幕强制收束 / 收尾幕 ──

def _gen_session(flow, nodes, events):
    return FakeSession(
        rows={
            StoryFlow: flow,
            StoryFlowNode: nodes,
            SceneEvent: events,
            Book: make_book(),
            Chapter: make_chapter(),
        },
        by_id={Book: {1: make_book()}, Chapter: {1: make_chapter()}},
    )


@pytest.mark.asyncio
async def test_generate_scene_node_more_marker_stays_on_event(monkeypatch):
    """尾区含 ###MORE### 且未达上限 → 停留在当前事件（index 不变）。"""
    flow = make_flow()
    flow.anchor_event_ids = [100, 200]
    flow.current_event_index = 0
    event1 = make_event()
    event2 = make_event(id=200, title="星门之后")
    session = _gen_session(flow, [], [event1, event2])

    def fake_model_factory(config):
        return SimpleNamespace(
            main=FakeLLM([
                "林星辰推开了密室的暗门。",
                "###OPTIONS###",
                '[{"text":"继续深入"}]\n###MORE###',
            ])
        )

    monkeypatch.setattr(service, "ModelFactory", fake_model_factory)

    events = [e async for e in service._generate_scene_node(
        session=session,
        flow=flow,
        book=make_book(),
        chapter=make_chapter(),
        model_config={"main_config": {}},
        seq=1,
        index=0,
        view_character_id=None,
    )]

    assert events[-2]["type"] == "scene_done"
    assert events[-2]["node"]["options"] == [{"text": "继续深入"}]
    assert flow.current_event_index == 0  # 停留：同一事件下一幕
    assert flow.status == "active"


@pytest.mark.asyncio
async def test_generate_scene_node_more_capped_at_three(monkeypatch):
    """已 2 幕且尾区含 ###MORE### → 第 3 幕强制收束，推进到下一事件。"""
    flow = make_flow()
    flow.anchor_event_ids = [100, 200]
    flow.current_event_index = 0
    event1 = make_event()
    event2 = make_event(id=200, title="星门之后")
    node1 = make_node(seq=1, chosen="选项一")
    node2 = make_node(seq=2, chosen="选项一", title="密室觉醒", narration="第二幕")
    session = _gen_session(flow, [node1, node2], [event1, event2])

    def fake_model_factory(config):
        return SimpleNamespace(
            main=FakeLLM([
                "第三幕叙事。",
                "###OPTIONS###",
                '[{"text":"继续深入"}]\n###MORE###',
            ])
        )

    monkeypatch.setattr(service, "ModelFactory", fake_model_factory)

    events = [e async for e in service._generate_scene_node(
        session=session,
        flow=flow,
        book=make_book(),
        chapter=make_chapter(),
        model_config={"main_config": {}},
        seq=3,
        index=0,
        view_character_id=None,
    )]

    assert events[-2]["type"] == "scene_done"
    assert flow.current_event_index == 1  # 第 3 幕强制推进下一事件
    assert flow.status == "active"


@pytest.mark.asyncio
async def test_generate_scene_node_closing_completes(monkeypatch):
    """收尾幕（closing=True）→ 生成后会话置 completed，scene_done completed=True。"""
    flow = make_flow()
    flow.anchor_event_ids = [100]
    flow.current_event_index = 1  # 事件已全部推演完
    event1 = make_event()
    session = _gen_session(flow, [], [event1])

    def fake_model_factory(config):
        return SimpleNamespace(
            main=FakeLLM([
                "夜色渐深，故事在这一章暂时落幕。",
                "###OPTIONS###",
                '[{"text":"就此作别"}]',
            ])
        )

    monkeypatch.setattr(service, "ModelFactory", fake_model_factory)

    events = [e async for e in service._generate_scene_node(
        session=session,
        flow=flow,
        book=make_book(),
        chapter=make_chapter(),
        model_config={"main_config": {}},
        seq=2,
        index=-1,
        view_character_id=None,
        closing=True,
    )]

    assert events[-2]["type"] == "scene_done"
    assert events[-2]["completed"] is True
    assert events[-2]["node"]["anchoredEventId"] is None
    assert flow.status == "completed"
    assert flow.current_event_index == 1  # 哨兵：== len(anchor_ids)


# ── complete：摘要生成失败 → 回退决策链拼接 ──

@pytest.mark.asyncio
async def test_complete_flow_fallback_on_llm_failure(monkeypatch):
    flow = make_flow()
    node1 = make_node(seq=1, chosen="仔细研究")
    node2 = make_node(seq=2, chosen="踏入星门", title="第二幕")
    session = FakeSession(
        rows={StoryFlow: flow, StoryFlowNode: [node1, node2]},
        by_id={
            StoryFlow: {10: flow},
            StoryFlowNode: {100: node1, 200: node2},
            Book: {1: make_book()},
            Chapter: {1: make_chapter()},
        },
    )

    async def broken_llm(config):
        raise RuntimeError("模型服务异常")

    monkeypatch.setattr(service, "_make_llm", broken_llm)

    summary = await service.complete_flow(
        session=session, flow=flow, model_config={"main_config": {}}
    )

    assert "密室觉醒：仔细研究" in summary
    assert "第二幕：踏入星门" in summary
    assert flow.status == "completed"
    assert flow.summary == summary


@pytest.mark.asyncio
async def test_complete_flow_idempotent_returns_stored_summary():
    flow = make_flow()
    flow.status = "completed"
    flow.summary = "已有摘要"
    session = FakeSession(rows={StoryFlow: flow})

    summary = await service.complete_flow(
        session=session, flow=flow, model_config={"main_config": {}}
    )
    assert summary == "已有摘要"


# ── 序列化 ──

def test_flow_node_serialization_camel_case():
    node = make_node(seq=1, chosen="选项")
    d = node_to_dict(node)
    assert d["chosenOption"] == "选项"
    assert d["anchoredEventId"] == 100
    assert d["locationName"] is None
    assert d["characterNames"] == []

    flow = make_flow()
    f = flow_to_dict(flow)
    assert f["bookId"] == 1
    assert f["chapterId"] == 1
    assert f["currentEventIndex"] == 0
    assert f["viewCharacterId"] is None
    assert f["anchorEventIds"] == [100]
