"""WebSearchService（博查搜索 + 缓存）测试：mock httpx，不触发真实网络。"""

from __future__ import annotations

import pytest

from domains.agent.web_search_service import WebSearchService


class FakeCache:
    def __init__(self, results):
        self.results = results
        self.hit_count = 0


class FakeSession:
    def __init__(self, cache=None):
        self.cache = cache
        self.added = []
        self.committed = 0
        self.flushed = 0
        self.refreshed = 0

    async def execute(self, stmt):
        cache = self.cache

        class R:
            def scalar_one_or_none(self):
                return cache

        return R()

    async def commit(self):
        self.committed += 1

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self.flushed += 1

    async def refresh(self, obj):
        self.refreshed += 1


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self._status = status

    def raise_for_status(self):
        if self._status >= 400:
            raise RuntimeError(f"HTTP {self._status}")

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.last_json = None
        self.last_headers = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, *, json=None, headers=None):
        self.last_json = json
        self.last_headers = headers
        return self.response


def patch_httpx(monkeypatch, response: FakeResponse):
    """替换全局 httpx.AsyncClient（web_search_service 在函数内 import httpx）。"""

    class FakeAsyncClient(FakeClient):
        def __init__(self, timeout=None):
            super().__init__(response)

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)


@pytest.mark.asyncio
async def test_search_success_parses_results(monkeypatch):
    """博查返回 results → 解析为 title/snippet/url。"""
    fake = FakeResponse({"data": {"webPages": {"value": [
        {"name": "标题A", "summary": "摘要A", "url": "http://a"},
        {"name": "标题B", "summary": "摘要B", "url": "http://b"},
        {"name": "标题C", "summary": "摘要C", "url": "http://c"},
    ]}}})
    patch_httpx(monkeypatch, fake)
    session = FakeSession()
    results = await WebSearchService(session).search("测试查询", "sk-test", top_k=5)

    assert len(results) == 3
    assert results[0] == {"title": "标题A", "snippet": "摘要A", "url": "http://a"}
    assert session.flushed >= 1  # 缓存写入（_save_cache 使用 flush）


@pytest.mark.asyncio
async def test_search_network_error_returns_error_entry(monkeypatch):
    """网络异常 → 返回错误条目而非抛错（Agent 工具可继续）。"""
    fake = FakeResponse({}, status=500)
    patch_httpx(monkeypatch, fake)
    session = FakeSession()
    results = await WebSearchService(session).search("查询", "sk-test")
    assert len(results) == 1
    assert "error" in results[0]


@pytest.mark.asyncio
async def test_search_cache_hit_skips_network(monkeypatch):
    """缓存命中 → 直接返回缓存，不调博查。"""
    cached = [{"title": "缓存结果", "snippet": "s", "url": "u"}]
    fake = FakeResponse({"data": {"webPages": {"value": [{"name": "新结果", "summary": "x", "url": "y"}]}}})
    httpx_mod = patch_httpx(monkeypatch, fake)
    session = FakeSession(cache=FakeCache(cached))

    results = await WebSearchService(session).search("相同查询", "sk-test")
    assert results == cached
    assert session.cache.hit_count == 1


@pytest.mark.asyncio
async def test_search_cache_disabled(monkeypatch):
    """use_cache=False 时不查缓存、不写缓存。"""
    fake = FakeResponse({"data": {"webPages": {"value": [{"name": "t", "summary": "s", "url": "u"}]}}})
    patch_httpx(monkeypatch, fake)
    session = FakeSession(cache=FakeCache([{"title": "旧", "snippet": "s", "url": "u"}]))
    results = await WebSearchService(session).search("q", "sk-test", use_cache=False)
    assert results[0]["title"] == "t"
    assert session.cache.hit_count == 0
