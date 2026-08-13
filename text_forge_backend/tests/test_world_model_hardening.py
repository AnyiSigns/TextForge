"""世界观域 / 模型域加固回归测试（纯单元，无需 DB/Redis）。

覆盖：
- delete_scene_event 清理 Foreshadowing.related_event_id 反向引用（限定 book_id）
- world service 写入前 status 中文别名归一化
- 派生重算保留 paused / abandoned 手工状态，其余仍由大纲派生
- /models/proxy 路径白名单（目录穿越 / 非白名单仓库 / 非法扩展名）
- /models/test 的 SSRF 地址校验（内网、环回、非 http 协议一律拒绝）
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from tests.conftest import FakeSession


class _RecordingSession(FakeSession):
    """记录所有 execute 语句的假会话，用于断言删除时的级联清理。"""

    def __init__(self, rows: dict | None = None):
        super().__init__(rows or {})
        self.statements: list[str] = []

    async def execute(self, stmt):
        from sqlalchemy.sql import Select

        self.statements.append(str(stmt))
        # FakeSession 只识别 select，UPDATE / DELETE 直接返回空结果即可
        if not isinstance(stmt, Select):
            from tests.conftest import FakeResult

            return FakeResult()
        return await super().execute(stmt)


# ---------------------------------------------------------------------------
# delete_scene_event 反向引用清理
# ---------------------------------------------------------------------------


async def test_delete_scene_event_clears_foreshadowing_related_event_id():
    """删除场景事件时先把伏笔的 related_event_id 置空，再删事件并提交。"""
    from domains.world.repository import WorldRepository

    session = _RecordingSession()
    await WorldRepository(session).delete_scene_event(5, 1)

    assert len(session.statements) == 2
    update_sql, delete_sql = session.statements
    assert update_sql.startswith("UPDATE foreshadowings")
    assert "related_event_id" in update_sql
    # 必须带书边界，避免误清其他书籍引用同一整数 ID 的伏笔
    assert "foreshadowings.book_id" in update_sql
    assert delete_sql.startswith("DELETE FROM scene_events")
    assert session.committed is True


# ---------------------------------------------------------------------------
# 写入前 status 中文别名归一化
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [("已埋下", "planted"), ("已回收", "resolved"), ("resolved", "resolved")],
)
def test_normalize_status_foreshadowing(raw, expected):
    from domains.world.constants import normalize_foreshadowing_status
    from domains.world.service import _normalize_status

    assert _normalize_status({"status": raw}, normalize_foreshadowing_status)["status"] == expected


@pytest.mark.parametrize(
    "raw,expected",
    [("进行中", "active"), ("已完成", "completed"), ("已暂停", "paused")],
)
def test_normalize_status_plot_thread(raw, expected):
    from domains.world.constants import normalize_plot_thread_status
    from domains.world.service import _normalize_status

    assert _normalize_status({"status": raw}, normalize_plot_thread_status)["status"] == expected


def test_normalize_status_skips_absent_or_empty():
    """未传 / 空 status 不应被写入英文默认值（PATCH 局部更新语义）。"""
    from domains.world.constants import normalize_plot_thread_status
    from domains.world.service import _normalize_status

    assert "status" not in _normalize_status({"name": "主线"}, normalize_plot_thread_status)
    assert _normalize_status({"status": ""}, normalize_plot_thread_status)["status"] == ""


# ---------------------------------------------------------------------------
# 派生重算保留手工状态
# ---------------------------------------------------------------------------


def _event(eid: int, chapter_id: int, **kw):
    return SimpleNamespace(
        id=eid,
        chapter_id=chapter_id,
        character_ids=kw.get("character_ids", []),
        plot_thread_ids=kw.get("plot_thread_ids", []),
        completed_plot_thread_ids=kw.get("completed_plot_thread_ids", []),
        resolved_foreshadowing_ids=kw.get("resolved_foreshadowing_ids", []),
    )


async def test_sync_plot_threads_preserves_manual_status():
    """paused / abandoned 为作者手工语义，重算不覆盖；其余仍按大纲派生。"""
    from domains.world.derived_sync import _sync_plot_threads
    from models.book import PlotThread

    paused = SimpleNamespace(id=1, status="paused", start_chapter_id=None, end_chapter_id=None, related_character_ids=[])
    abandoned = SimpleNamespace(id=2, status="abandoned", start_chapter_id=None, end_chapter_id=None, related_character_ids=[])
    active = SimpleNamespace(id=3, status="active", start_chapter_id=None, end_chapter_id=None, related_character_ids=[])
    events = [
        _event(10, 100, plot_thread_ids=[1, 2, 3], completed_plot_thread_ids=[1, 2, 3], character_ids=[7]),
    ]
    session = FakeSession({PlotThread: [paused, abandoned, active]})

    await _sync_plot_threads(session, events, 1)

    assert paused.status == "paused"
    assert abandoned.status == "abandoned"
    # 默认派生行为不变：有完结场景 → completed
    assert active.status == "completed"
    # 手工状态豁免只作用于 status，其余派生列照常重算
    assert paused.start_chapter_id == 100
    assert paused.end_chapter_id == 100
    assert paused.related_character_ids == [7]


async def test_sync_plot_threads_defaults_to_active_without_completion():
    from domains.world.derived_sync import _sync_plot_threads
    from models.book import PlotThread

    thread = SimpleNamespace(id=1, status="completed", start_chapter_id=None, end_chapter_id=9, related_character_ids=[])
    session = FakeSession({PlotThread: [thread]})

    await _sync_plot_threads(session, [_event(10, 100, plot_thread_ids=[1])], 1)

    assert thread.status == "active"
    assert thread.end_chapter_id is None


async def test_sync_foreshadowings_preserves_manual_status():
    from domains.world.derived_sync import _sync_foreshadowings
    from models.book import Foreshadowing

    abandoned = SimpleNamespace(id=1, status="abandoned", related_event_id=10, planted_at_chapter_id=None, resolved_at_chapter_id=None)
    planted = SimpleNamespace(id=2, status="planted", related_event_id=10, planted_at_chapter_id=None, resolved_at_chapter_id=None)
    events = [_event(10, 100, resolved_foreshadowing_ids=[1, 2])]
    session = FakeSession({Foreshadowing: [abandoned, planted]})

    await _sync_foreshadowings(session, events, 1)

    assert abandoned.status == "abandoned"
    # 默认派生行为不变：有揭示场景 → resolved
    assert planted.status == "resolved"
    assert abandoned.planted_at_chapter_id == 100
    assert abandoned.resolved_at_chapter_id == 100


# ---------------------------------------------------------------------------
# /models/proxy 路径白名单
# ---------------------------------------------------------------------------


def test_proxy_path_allows_whitelisted_model_file():
    from domains.model.router import _assert_allowed_proxy_path

    _assert_allowed_proxy_path("Xenova/bge-small-zh-v1.5/resolve/main/config.json")
    _assert_allowed_proxy_path("Xenova/bge-base-zh-v1.5/resolve/main/onnx/model_quantized.onnx")


@pytest.mark.parametrize(
    "path",
    [
        "",
        "Xenova/bge-small-zh-v1.5/../../etc/passwd",
        "Xenova/bge-small-zh-v1.5/.git/config.json",
        "//evil.com/a.json",
        "https://evil.com/a.json",
        "Xenova\\bge-small-zh-v1.5\\config.json",
    ],
)
def test_proxy_path_rejects_malformed(path):
    from domains.model.router import _assert_allowed_proxy_path

    with pytest.raises(HTTPException) as exc:
        _assert_allowed_proxy_path(path)
    assert exc.value.status_code == 400


def test_proxy_path_rejects_unlisted_repo():
    from domains.model.router import _assert_allowed_proxy_path

    with pytest.raises(HTTPException) as exc:
        _assert_allowed_proxy_path("someone/private-model/resolve/main/config.json")
    assert exc.value.status_code == 403


def test_proxy_path_rejects_unlisted_suffix():
    from domains.model.router import _assert_allowed_proxy_path

    with pytest.raises(HTTPException) as exc:
        _assert_allowed_proxy_path("Xenova/bge-small-zh-v1.5/resolve/main/run.sh")
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# /models/test 的 SSRF 地址校验
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "https://api.openai.com/v1",
        "http://8.8.8.8:8000/v1",
    ],
)
def test_is_public_http_url_allows_cloud_endpoints(url):
    from shared.utils import is_public_http_url

    assert is_public_http_url(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "",
        "ftp://example.com/v1",
        "file:///etc/passwd",
        "http://127.0.0.1:8000/v1",
        "http://localhost:8000/v1",
        "http://10.0.0.8/v1",
        "http://172.16.3.4/v1",
        "http://192.168.1.5/v1",
        "http://169.254.169.254/latest/meta-data/",
        "http://0.0.0.0/v1",
        "http://[::1]/v1",
        "http://gateway.internal/v1",
    ],
)
def test_is_public_http_url_rejects_internal(url):
    from shared.utils import is_public_http_url

    assert is_public_http_url(url) is False
