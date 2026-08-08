"""workflow_runner _finish_with_candidate 自动沿用（仅首次确认）回归测试。

覆盖：
- 无偏好时展示候选列表（候选序号用「候选N」文本前缀，避免 markdown 拆分列表导致都显示 1）
- 有偏好且候选匹配时自动落库，不再询问
- 偏好节点不存在时回退展示候选
- 偏好输出为空时回退
"""

from __future__ import annotations

import pytest

from domains.agent.workflow_runner_node import _finish_with_candidate


def make_result(status="completed", nodes=None) -> dict:
    return {
        "status": status,
        "content_nodes": nodes
        or [
            {"node_id": "writer", "node_label": "执笔写手", "output": "写手正文", "summary": "写手摘要"},
            {"node_id": "polish", "node_label": "文风润色师", "output": "润色正文", "summary": "润色摘要"},
        ],
    }


class FakeChapter:
    def __init__(self, locked=False):
        self.id = 74
        self.locked = locked


class FakeSession:
    def __init__(self, chapter=None):
        self.chapter = chapter or FakeChapter()
        self.query_count = 0

    async def execute(self, stmt):
        self.query_count += 1
        if self.query_count == 1:
            return SimpleResult(self.chapter)
        return SimpleResult(2)

    async def commit(self):
        return None

    def add(self, obj):
        self.added = obj


class SimpleResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value if self.value else None

    def scalar(self):
        return self.value if isinstance(self.value, int) else None


class FakeDB:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *a):
        return False


def patch_db(monkeypatch, session=None):
    """替换 shared.database.db_manager.with_db 为一个异步上下文管理器。"""
    fake = FakeDB(session or FakeSession())
    monkeypatch.setattr(
        "shared.database.db_manager",
        SimpleNamespace(with_db=lambda: fake),
    )
    return fake


@pytest.mark.asyncio
async def test_finish_without_preference_shows_candidates(monkeypatch):
    """无偏好时展示候选列表，且序号为「候选1/候选2」文本前缀。"""
    patch_db(monkeypatch)
    update = await _finish_with_candidate(make_result(), target_chapter_id=74)
    reply = update["messages"][0].content
    assert "候选1：【执笔写手】" in reply
    assert "候选2：【文风润色师】" in reply
    assert "回复「候选序号」" in reply


@pytest.mark.asyncio
async def test_finish_with_preference_auto_writes(monkeypatch):
    """有偏好且候选匹配 → 直接落库，不再询问选择。"""
    session = FakeSession()
    fake = patch_db(monkeypatch, session)
    update = await _finish_with_candidate(
        make_result(), target_chapter_id=74, preferred_node_id="polish"
    )
    reply = update["messages"][0].content
    assert "自动沿用" in reply
    assert "候选" not in reply
    assert "已自动沿用您此前选定的【文风润色师】节点" in reply
    assert update["candidate_reply_ready"] is True
    # 完整正文持久化到 workflow_node_outputs（供后续 write_workflow_candidate 读取）
    outputs = update.get("workflow_node_outputs") or {}
    assert outputs["polish"]["output"] == "润色正文"


@pytest.mark.asyncio
async def test_finish_with_preference_node_missing_falls_back(monkeypatch):
    """偏好节点不在候选列表 → 回退展示候选列表。"""
    patch_db(monkeypatch)
    update = await _finish_with_candidate(
        make_result(), target_chapter_id=74, preferred_node_id="missing"
    )
    reply = update["messages"][0].content
    assert "候选1：【执笔写手】" in reply


@pytest.mark.asyncio
async def test_finish_with_preference_empty_output_falls_back(monkeypatch):
    """偏好节点输出为空 → 回退，不落库。"""
    result = make_result(
        nodes=[{"node_id": "writer", "node_label": "执笔写手", "output": "", "summary": ""}]
    )
    patch_db(monkeypatch)
    update = await _finish_with_candidate(result, target_chapter_id=74, preferred_node_id="writer")
    reply = update["messages"][0].content
    assert "输出为空" in reply


@pytest.mark.asyncio
async def test_finish_error_status(monkeypatch):
    """status=error → 返回错误信息。"""
    patch_db(monkeypatch)
    update = await _finish_with_candidate(make_result(status="error"), target_chapter_id=74)
    assert "工作流执行失败" in update["messages"][0].content


@pytest.mark.asyncio
async def test_finish_pending_review_builds_review_card(monkeypatch):
    """status=pending_review → 回复告知拦截，并写入 pending_review（router 据此推送 review_card 弹审核卡）。"""
    patch_db(monkeypatch)
    result = {
        "status": "pending_review",
        "pending_node_id": "writer",
        "pending_node_label": "执笔写手",
        "node_results": [
            {
                "node_id": "writer",
                "node_label": "执笔写手",
                "output": "被拦截的正文内容……" * 30,
                "status": "fail",
                "quality_check": {"passed": False, "reason": "输出未达角色设定要求", "system_prompt": "你要写出……"},
            }
        ],
    }
    update = await _finish_with_candidate(result, target_chapter_id=74)
    reply = update["messages"][0].content
    assert "触发审计拦截" in reply
    pr = update.get("pending_review")
    assert pr is not None
    assert pr["node_id"] == "writer"
    assert pr["node_label"] == "执笔写手"
    assert "输出未达角色设定要求" in pr["reason"]
    assert "你要写出" in pr["system_prompt"]


from types import SimpleNamespace
