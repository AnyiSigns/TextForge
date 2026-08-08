"""wizard 生成候选卡片 — 字段映射测试。

验证后端把 LLM 输出（title/type/description/time/location/reveal_timing 等）
映射为前端可读的统一 label（「类型」「描述」「时间」「地点」「揭示时机」等），
与前端 initializerStore 读取的 key 完全对齐。
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from domains.wizard import router as wizard_router
from domains.wizard.router import _extract_json, _to_candidate_fields
from main import app
from models.book import Book, Chapter, Character, CreativeSetting, Location, Volume


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class ScalarListResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class FakeSession:
    """按查询实体分派返回假数据的最小 session。"""

    def __init__(self, book: Book | None, volumes: list | None = None, chapters: list | None = None):
        self.book = book
        self.volumes = volumes or []
        self.chapters = chapters or []

    async def execute(self, stmt):
        ent = stmt.column_descriptions[0]["entity"]
        if ent is Book:
            return ScalarResult(self.book)
        if ent is CreativeSetting:
            return ScalarResult(None)
        if ent in (Location, Character, Volume, Chapter):
            return ScalarListResult([])
        return ScalarListResult([])


def make_book() -> Book:
    return Book(id=1, user_id=1, title="测试书", genre="奇幻", description="简介")


def install_llm(monkeypatch, raw_text: str):
    class FakeLLM:
        async def ainvoke(self, messages):
            return SimpleNamespace(content=raw_text)

    monkeypatch.setattr(
        wizard_router, "ModelFactory",
        lambda cfg: SimpleNamespace(main=FakeLLM()),
    )


async def call_generate(monkeypatch, step: int, raw_text: str) -> tuple[int, dict]:
    install_llm(monkeypatch, raw_text)
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/wizard/generate", json={"bookId": 1, "step": step})
        return resp.status_code, resp.json()
    finally:
        app.dependency_overrides.clear()


# ── 纯函数：_to_candidate_fields ──

def test_field_map_location_step():
    """地点卡片：type/description → 「类型」「描述」。"""
    fields = _to_candidate_fields({"title": "王都", "type": "王都", "description": "繁华都城"})
    keys = [f["key"] for f in fields]
    assert "类型" in keys and "描述" in keys
    by_key = {f["key"]: f["value"] for f in fields}
    assert by_key["类型"] == "王都"
    assert by_key["描述"] == "繁华都城"


def test_field_map_event_step():
    """事件卡片：time/location/description → 「时间」「地点」「描述」。"""
    fields = _to_candidate_fields({"title": "城门相遇", "time": "第一天清晨", "location": "王都", "description": "相遇"})
    by_key = {f["key"]: f["value"] for f in fields}
    assert by_key["时间"] == "第一天清晨"
    assert by_key["地点"] == "王都"
    assert by_key["描述"] == "相遇"


def test_field_map_foreshadowing_step():
    """伏笔卡片：type/content/reveal_timing → 「类型」「内容」「揭示时机」。"""
    fields = _to_candidate_fields({"title": "断剑", "type": "身份谜团", "content": "断剑是神器", "reveal_timing": "第三卷"})
    by_key = {f["key"]: f["value"] for f in fields}
    assert by_key["类型"] == "身份谜团"
    assert by_key["内容"] == "断剑是神器"
    assert by_key["揭示时机"] == "第三卷"


def test_field_map_character_lists_serialized():
    """角色卡片：aliases 数组/custom_fields 对象 → JSON 字符串。"""
    fields = _to_candidate_fields({
        "title": "林晚", "role_type": "主角",
        "aliases": ["剑圣"], "status": "流放中",
        "custom_fields": {"功法": "九天星辰诀"},
    })
    by_key = {f["key"]: f["value"] for f in fields}
    assert by_key["角色类型"] == "主角"
    assert by_key["别名"] == '["剑圣"]'
    assert by_key["角色状态"] == "流放中"
    assert "九天星辰诀" in by_key["自定义字段"]


def test_field_map_step0_form():
    """Step0 表单：tone/worldview/taboos/custom_fields 映射。"""
    fields = _to_candidate_fields({
        "title": "星辰纪元", "tone": "史诗奇幻", "worldview": "星辰之力",
        "taboos": "禁止科技", "custom_fields": [{"key": "战力体系", "value": "星辰等级制"}],
    })
    by_key = {f["key"]: f["value"] for f in fields}
    assert by_key["文风基调"] == "史诗奇幻"
    assert by_key["世界观"] == "星辰之力"
    assert by_key["写作禁忌"] == "禁止科技"
    assert "战力体系" in by_key["自定义字段"]


def test_extract_json_three_formats():
    """_extract_json 兼容裸 JSON / 代码块 / 包裹对象。"""
    assert _extract_json('{"a": 1}') == {"a": 1}
    assert _extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _extract_json('前缀 {"a": 1} 后缀') == {"a": 1}
    assert _extract_json('没有 json') is None


# ── 端到端：/api/wizard/generate（mock LLM + fake DB） ──

@pytest.mark.asyncio
async def test_generate_step5_events_labels(monkeypatch):
    """Step5 事件：LLM 原始 key 转成前端 label（时间/地点/描述）。"""
    raw = '{"cards": [{"title": "城门相遇", "time": "第一天清晨", "location": "王都", "description": "主角相遇神秘人"}]}'
    status, data = await call_generate(monkeypatch, 5, raw)
    assert status == 200
    card = data["cards"][0]
    by_key = {f["key"]: f["value"] for f in card["fields"]}
    assert by_key["时间"] == "第一天清晨"
    assert by_key["地点"] == "王都"
    assert by_key["描述"] == "主角相遇神秘人"


@pytest.mark.asyncio
async def test_generate_step6_foreshadowing_labels(monkeypatch):
    """Step6 伏笔：type/reveal_timing 转成「类型」「揭示时机」。"""
    raw = '{"cards": [{"title": "断剑之谜", "type": "身份谜团", "content": "断剑实为神器", "reveal_timing": "第三卷决战前夕"}]}'
    status, data = await call_generate(monkeypatch, 6, raw)
    assert status == 200
    by_key = {f["key"]: f["value"] for f in data["cards"][0]["fields"]}
    assert by_key["类型"] == "身份谜团"
    assert by_key["揭示时机"] == "第三卷决战前夕"
    assert by_key["内容"] == "断剑实为神器"


@pytest.mark.asyncio
async def test_generate_step0_single_object_wrapped(monkeypatch):
    """Step0：单对象输出被包装为 cards 数组。"""
    raw = '{"title": "星辰纪元", "tone": "史诗奇幻", "worldview": "星辰之力驱动", "taboos": "禁科技", "custom_fields": [{"key": "战力体系", "value": "星辰等级制"}]}'
    status, data = await call_generate(monkeypatch, 0, raw)
    assert status == 200
    assert len(data["cards"]) == 1
    by_key = {f["key"]: f["value"] for f in data["cards"][0]["fields"]}
    assert by_key["文风基调"] == "史诗奇幻"
    assert "星辰等级制" in by_key["自定义字段"]


@pytest.mark.asyncio
async def test_generate_rejects_bad_step(monkeypatch):
    """step 越界被 pydantic 校验拦截（422）。"""
    install_llm(monkeypatch, "{}")
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/wizard/generate", json={"bookId": 1, "step": 9})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_generate_requires_auth():
    """未认证返回 401。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/wizard/generate", json={"bookId": 1, "step": 1})
    assert resp.status_code in (401, 403)
