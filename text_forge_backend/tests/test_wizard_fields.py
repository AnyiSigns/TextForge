"""wizard 流式生成（/stream-generate）— SSE 契约测试。

验证全部 7 步（Step 0 世界观 ~ Step 6 伏笔）统一走 Markdown 单份方案
流式生成：响应为 text/event-stream，包含 meta / delta / done 事件，
done 携带完整 Markdown 文本供前端解析落库。
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
        if ent in (Location, Character, PlotThread, Volume, Chapter, SceneEvent):
            return ScalarListResult([])
        return ScalarListResult([])


def make_book() -> Book:
    return Book(id=1, user_id=1, title="测试书", genre="奇幻", description="简介")


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
