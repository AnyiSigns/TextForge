"""P0-4 注册→验证→登录闭环集成测试。

依赖运行中的后端（localhost:8000）与 Redis（验证码存储）。
验证码不依赖 SMTP 真实收件：直接从 Redis 读取（verification:{email}）。

运行方式：后端必须已启动（uvicorn main:app --port 8000），Redis 已启动。
后端不可达时自动 skip。
"""

from __future__ import annotations

import asyncio
import uuid

import httpx
import pytest

BACKEND = "http://127.0.0.1:8000"

_PASSWORD = "test123456"


def _backend_reachable() -> bool:
    try:
        resp = httpx.get(f"{BACKEND}/api/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _backend_reachable(), reason="后端未运行，跳过集成测试")


async def _read_verification_code(email: str) -> str:
    """从 Redis 读取验证码。"""
    from shared.redis import redis_client

    code = await redis_client.get(f"verification:{email}")
    assert code, f"Redis 中无验证码: {email}"
    return code


@pytest.mark.asyncio
async def test_register_verify_login_roundtrip():
    """注册 → Redis 读码 → 邮箱验证 → 登录 → 拉取个人资料。"""
    email = f"e2e_integ_{uuid.uuid4().hex[:8]}@example.com"

    async with httpx.AsyncClient(base_url=BACKEND, timeout=15) as client:
        # 1. 注册
        resp = await client.post("/api/auth/register", json={
            "user_name": f"集成_{uuid.uuid4().hex[:6]}",
            "email": email,
            "password": _PASSWORD,
        })
        assert resp.status_code == 200, resp.text

        # 2. 从 Redis 读取验证码（不依赖收邮件）
        code = await _read_verification_code(email)

        # 3. 邮箱验证
        resp = await client.post("/api/auth/verify-email", json={"email": email, "code": code})
        assert resp.status_code == 200, resp.text

        # 4. 登录
        resp = await client.post("/api/auth/login", json={"email": email, "password": _PASSWORD})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        access_token = data.get("access_token") or data.get("accessToken")
        assert access_token, f"登录响应无 token: {data}"

        # 5. 带 token 拉取个人资料
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = await client.get("/api/user/profile", headers=headers)
        assert resp.status_code == 200, resp.text
        profile = resp.json()
        user = profile.get("user") or profile
        assert user.get("email") == email


@pytest.mark.asyncio
async def test_login_rejected_before_verification():
    """未验证邮箱登录应被拒绝（保护逻辑存在）。"""
    email = f"e2e_integ_unver_{uuid.uuid4().hex[:8]}@example.com"

    async with httpx.AsyncClient(base_url=BACKEND, timeout=15) as client:
        resp = await client.post("/api/auth/register", json={
            "user_name": f"集成_{uuid.uuid4().hex[:6]}",
            "email": email,
            "password": _PASSWORD,
        })
        assert resp.status_code == 200, resp.text

        resp = await client.post("/api/auth/login", json={"email": email, "password": _PASSWORD})
        assert resp.status_code == 403, resp.text
        assert "未验证" in resp.text
