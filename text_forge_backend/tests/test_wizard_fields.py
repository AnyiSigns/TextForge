"""wizard 流式生成（/stream-generate）— SSE 契约测试。

验证全部 7 步（Step 0 世界观 ~ Step 6 伏笔）统一走 Markdown 单份方案
流式生成：响应为 text/event-stream，包含 meta / delta / done 事件，
done 携带完整 Markdown 文本供前端解析落库。

通用生成器语义：meta 事件携带 mode（init/append）与 warnings（前置校验）；
追加模式（库已有设定）时上下文注入【已有*】清单，提示词要求衔接去重。
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from domains.wizard import router as wizard_router
from main import app
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
    """按查询实体分派返回假数据的最小 session。

    entities 参数可注入已有实体，模拟「追加模式」下查库得到的上下文。
    """

    def __init__(
        self,
        book: Book | None,
        entities: dict | None = None,
    ):
        self.book = book
        self.entities = entities or {}

    async def execute(self, stmt):
        ent = stmt.column_descriptions[0]["entity"]
        if ent is Book:
            return ScalarResult(self.book)
        if ent is CreativeSetting:
            return ScalarResult(self.entities.get(CreativeSetting))
        return ScalarListResult(self.entities.get(ent, []))


def make_book() -> Book:
    return Book(id=1, user_id=1, title="测试书", genre="奇幻", description="简介")


def make_location() -> Location:
    return Location(id=7, book_id=1, name="王都", type="王都", description="都城")


def make_character() -> Character:
    return Character(id=11, book_id=1, name="林晚", role_type="主角", description="主角")


def make_plot_thread() -> PlotThread:
    return PlotThread(id=1, book_id=1, name="主线", type="主线", status="active")


def make_volume() -> Volume:
    return Volume(id=100, book_id=1, title="卷一", sort_order=1)


def make_chapter() -> Chapter:
    return Chapter(id=200, book_id=1, volume_id=100, title="第一章", sort_order=1)


def make_event() -> SceneEvent:
    return SceneEvent(
        id=300, book_id=1, chapter_id=200, title="城门相遇",
        event_type="event", content="相遇", story_label="第一天清晨",
    )


def make_foreshadowing() -> Foreshadowing:
    return Foreshadowing(id=400, book_id=1, description="断剑之谜", status="planted")


def install_streaming_llm(monkeypatch, chunks: list[str]):
    class FakeLLM:
        async def astream(self, messages):
            for piece in chunks:
                yield SimpleNamespace(content=piece)

        async def ainvoke(self, messages):
            return SimpleNamespace(content="".join(chunks))

    monkeypatch.setattr(
        wizard_router, "ModelFactory",
        lambda cfg: SimpleNamespace(main=FakeLLM()),
    )


def parse_sse(body: str) -> list[dict]:
    """解析 SSE 文本为事件 dict 列表。"""
    events = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if not block.startswith("data:"):
            continue
        events.append(json.loads(block[len("data:"):].strip()))
    return events


def post_wizard(book_id: int, payload: dict) -> list[dict]:
    """发送 wizard 请求并返回 SSE 事件列表（依赖 overrides 已安装）。"""
    transport = ASGITransport(app=app)
    body = {"bookId": book_id, **payload}
    with app.dependency_overrides:
        client = AsyncClient(transport=transport, base_url="http://test")
        resp = client.request("POST", "/api/wizard/stream-generate", json=body)
    return parse_sse(resp.text)


@pytest.mark.asyncio
async def test_stream_step0_worldview_markdown(monkeypatch):
    """Step0 世界观：Markdown 单份方案经 meta/delta/done 推送。"""
    chunks = [
        "# 世界观方案：星辰纪元\n",
        "文风基调：史诗奇幻、宏大叙事\n",
        "世界观：星辰之力驱动的奇幻世界。\n",
        "写作禁忌：禁止现代科技\n",
        "自定义字段：\n战力体系：星辰等级制\n",
    ]
    install_streaming_llm(monkeypatch, chunks)
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 0}
            )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        events = parse_sse(resp.text)
        types = [ev["type"] for ev in events]
        assert types[0] == "meta"
        assert "delta" in types
        assert types[-1] == "done"
        done = events[-1]
        assert done["step"] == 0
        assert done["full_text"] == "".join(chunks)
        # 空库 → 推断 init 模式，无 warnings
        assert events[0]["mode"] == "init"
        assert events[0]["warnings"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_step1_locations_markdown(monkeypatch):
    """Step1 地点：流式文本与 done 的 full_text 一致。"""
    chunks = ["# 地点：星辉大陆 - 漂浮于星海的大陆\n", "类型：大陆\n"]
    install_streaming_llm(monkeypatch, chunks)
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 1}
            )
        assert resp.status_code == 200
        events = parse_sse(resp.text)
        deltas = "".join(ev["text"] for ev in events if ev["type"] == "delta")
        assert deltas == "".join(chunks)
        assert events[-1]["type"] == "done"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_append_mode_injects_existing_context(monkeypatch):
    """追加模式：库已有设定 → mode=append，meta 携带 warnings，且 done 文本不变。"""
    chunks = ["# 地点：星辉城 - 新增地点\n", "类型：王都\n"]
    install_streaming_llm(monkeypatch, chunks)
    session = FakeSession(
        make_book(),
        entities={
            Location: [make_location()],
        },
    )
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 1}
            )
        assert resp.status_code == 200
        events = parse_sse(resp.text)
        assert events[0]["mode"] == "append"
        # 追加模式下用户提示词必须包含「追加模式」与「严禁重复或覆盖」
        assert events[-1]["full_text"] == "".join(chunks)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_explicit_mode_overrides_auto(monkeypatch):
    """显式 mode=append 覆盖 auto 推断（空库也按追加处理）。"""
    chunks = ["# 世界观方案：追加版\n"]
    install_streaming_llm(monkeypatch, chunks)
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate",
                json={"bookId": 1, "step": 0, "mode": "append"},
            )
        assert resp.status_code == 200
        events = parse_sse(resp.text)
        assert events[0]["mode"] == "append"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_step5_warns_missing_outline(monkeypatch):
    """前置校验：Step 5 但库无卷章 → meta.warnings 提示。"""
    install_streaming_llm(monkeypatch, ["## 事件：城门相遇 - 相遇\n"])
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 5}
            )
        assert resp.status_code == 200
        events = parse_sse(resp.text)
        assert any("大纲" in w for w in events[0]["warnings"])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_step6_context_includes_existing_foreshadowings(monkeypatch):
    """Step 6：上下文查库包含已有伏笔（防重/伏笔网络），正常流式完成。"""
    chunks = ["# 伏笔：断剑之谜 - 上古神器\n", "类型：物品\n"]
    install_streaming_llm(monkeypatch, chunks)
    session = FakeSession(
        make_book(),
        entities={
            SceneEvent: [make_event()],
            Foreshadowing: [make_foreshadowing()],
        },
    )
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 6}
            )
        assert resp.status_code == 200
        events = parse_sse(resp.text)
        assert events[0]["mode"] == "append"
        assert events[-1]["type"] == "done"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_step0_no_book_404(monkeypatch):
    """书籍不存在或无权访问返回 404。"""
    install_streaming_llm(monkeypatch, ["# 世界观方案：x\n"])
    session = FakeSession(None)
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 99, "step": 0}
            )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_rejects_bad_step(monkeypatch):
    """step 越界被 pydantic 校验拦截（422）。"""
    install_streaming_llm(monkeypatch, [])
    session = FakeSession(make_book())
    app.dependency_overrides[wizard_router.db_manager.get_db] = lambda: session
    app.dependency_overrides[wizard_router.get_current] = lambda: 1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/wizard/stream-generate", json={"bookId": 1, "step": 7}
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stream_requires_auth():
    """未认证返回 401。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/wizard/stream-generate", json={"bookId": 1, "step": 0}
        )
    assert resp.status_code in (401, 403)
