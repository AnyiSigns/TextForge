"""GatingService.apply 决策语义回归测试。

覆盖 审查修复：
- L1：写工具审批卡的 retry（「拒绝重试」）必须拒绝执行，不得把 AI 原文落库。
- L2：edit 决策按写操作映射到对应入参字段（chapter.write→content、
  chapter.edit→new_text、chapter.diff→unified_diff），并保留其余入参。
- terminate 仍返回取消标记，不执行工具。
"""

from __future__ import annotations

import pytest

from domains.common.gating_service import (
    OP_CHAPTER_DIFF,
    OP_CHAPTER_EDIT,
    OP_CHAPTER_WRITE,
    GatingService,
)


class _Recorder:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []


class _RecordingService(GatingService):
    """把 _invoke 换成记录器，避免真实工具/DB 依赖。"""

    def __init__(self, recorder: _Recorder):
        self._recorder = recorder
        super().__init__(session_factory=None, model_config={})

    async def _invoke(self, tool_name: str, args: dict) -> dict:
        self._recorder.calls.append((tool_name, args))
        return {"ok": True}


def _make_service() -> tuple[_RecordingService, _Recorder]:
    recorder = _Recorder()
    return _RecordingService(recorder), recorder


@pytest.mark.asyncio
async def test_apply_retry_rejects_without_executing():
    """L1：retry 决策返回取消标记，且不得调用工具。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_WRITE,
        "write_chapter_content",
        {"chapter_id": 74, "content": "AI 原文"},
        "retry",
    )
    assert result.get("cancelled") is True
    assert recorder.calls == []


@pytest.mark.asyncio
async def test_apply_terminate_rejects_without_executing():
    """terminate 决策返回取消标记，且不得调用工具。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_WRITE,
        "write_chapter_content",
        {"chapter_id": 74, "content": "AI 原文"},
        "terminate",
    )
    assert result.get("cancelled") is True
    assert recorder.calls == []


@pytest.mark.asyncio
async def test_apply_edit_chapter_write_overrides_content():
    """L2：edit 对 chapter.write 覆盖 content 字段，其余入参保留。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_WRITE,
        "write_chapter_content",
        {"chapter_id": 74, "content": "AI 原文"},
        "edit",
        edited_content="用户修改后的正文",
    )
    assert result == {"ok": True}
    assert recorder.calls == [
        ("write_chapter_content", {"chapter_id": 74, "content": "用户修改后的正文"})
    ]


@pytest.mark.asyncio
async def test_apply_edit_chapter_edit_overrides_new_text():
    """L2：edit 对 chapter.edit 覆盖 new_text 字段（此前被静默丢弃）。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_EDIT,
        "edit_chapter_content",
        {"chapter_id": 74, "old_text": "旧文", "new_text": "AI 替换"},
        "edit",
        edited_content="用户自定义替换",
    )
    assert result == {"ok": True}
    assert recorder.calls == [
        (
            "edit_chapter_content",
            {"chapter_id": 74, "old_text": "旧文", "new_text": "用户自定义替换"},
        )
    ]


@pytest.mark.asyncio
async def test_apply_edit_chapter_diff_overrides_unified_diff():
    """L2：edit 对 chapter.diff 覆盖 unified_diff 字段（此前被静默丢弃）。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_DIFF,
        "apply_chapter_diff",
        {"chapter_id": 74, "unified_diff": "@@ -1 +1 @@"},
        "edit",
        edited_content="@@ -1 +1 @@\n-旧+新",
    )
    assert result == {"ok": True}
    assert recorder.calls == [
        (
            "apply_chapter_diff",
            {"chapter_id": 74, "unified_diff": "@@ -1 +1 @@\n-旧+新"},
        )
    ]


@pytest.mark.asyncio
async def test_apply_accept_keeps_original_args():
    """accept 决策按原入参执行。"""
    service, recorder = _make_service()
    result = await service.apply(
        OP_CHAPTER_WRITE,
        "write_chapter_content",
        {"chapter_id": 74, "content": "AI 原文"},
        "accept",
    )
    assert result == {"ok": True}
    assert recorder.calls == [
        ("write_chapter_content", {"chapter_id": 74, "content": "AI 原文"})
    ]


@pytest.mark.asyncio
async def test_apply_edit_on_unknown_operation_keeps_original_args():
    """edit 作用于不支持编辑的操作时忽略用户修改但按原入参执行（不崩溃）。"""
    service, recorder = _make_service()
    result = await service.apply(
        "entity.create",
        "create_entities",
        {"characters": []},
        "edit",
        edited_content="用户修改",
    )
    assert result == {"ok": True}
    assert recorder.calls == [("create_entities", {"characters": []})]
