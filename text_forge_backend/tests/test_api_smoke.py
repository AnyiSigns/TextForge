"""API 冒烟集成测试（上线前必跑）。

不依赖数据库/Redis/LLM：用 httpx ASGITransport 直连 FastAPI 应用且不触发 lifespan，
只验证：应用可导入、核心路由已注册、无 DB 依赖的端点真实响应。

真实链路（登录→建书→AI）由 E2E 测试覆盖（tests/e2e/，Playwright）。
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


def test_core_routes_registered():
    """核心业务路由必须全部注册，防止遗漏 include_router。"""
    # app.routes 中 include_router 被包装为 _IncludedRouter（无 .path），
    # 用 OpenAPI schema 收集全部路径最可靠。
    paths = set(app.openapi().get("paths", {}).keys())
    expected = [
        # 认证
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/refresh",
        "/api/user/profile",
        # 模型配置
        "/api/models/test",
        "/api/models/proxy/{path}",
        # 书籍/大纲
        "/api/books/",
        "/api/books/{id}",
        "/api/books/{id}/volumes",
        "/api/books/{id}/chapters",
        "/api/books/{id}/characters",
        "/api/creative-settings/books/{book_id}",
        # 世界
        "/api/world/locations",
        "/api/world/timeline-events",
        "/api/world/plot-threads",
        "/api/world/foreshadowings",
        # Agent / 向导 / 工作流
        "/api/agent/start",
        "/api/agent/respond",
        "/api/agent/stream/{thread_id}",
        "/api/wizard/generate",
        "/api/workflows/",
        # 剧情流
        "/api/story-flows/",
        "/api/story-flows/{flow_id}",
        "/api/story-flows/{flow_id}/advance",
        "/api/story-flows/{flow_id}/complete",
        # 系统
        "/api/health",
        "/",
    ]
    missing = [p for p in expected if p not in paths]
    assert not missing, f"缺失路由: {missing}"


@pytest.mark.asyncio
async def test_health_endpoint_ok():
    """健康检查端点真实响应（无需 DB）。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_root_endpoint_ok():
    """根路径可访问。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_model_test_endpoint_requires_body():
    """/api/models/test 无认证应 401（端点已注册且受保护），证明可达。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/models/test", json={})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_respond_requires_auth():
    """/api/agent/respond 未带 token 应 401/403，而非 404。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/agent/respond", json={"thread_id": "x", "message": "hi"})
        assert resp.status_code in (401, 403, 422)
