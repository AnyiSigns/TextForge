"""v5 实施计划新增行为回归测试（纯单元，无需 DB/Redis）。

覆盖：
- 1.4：build_preview 章节预览 8000 截断 + _sse_review_card 按卡片类型截断
- 2.2：build_preview 审核卡契约补 tokens/elapsed_ms
- 2.3：turn_metrics SSE 嵌套结构
- 2.6：CompressRequest 接受 modelConfig 别名
- 2.10：_strip_api_key_from_checkpoint 剥离 api_key 且保留其余配置
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# 1.4 / 2.2：gating_service.build_preview
# ---------------------------------------------------------------------------


def test_build_preview_write_chapter_8000_truncation():
    from domains.common.gating_service import build_preview

    preview = build_preview("chapter.write", "write_chapter_content", {"chapter_id": 7, "content": "正" * 9000})
    assert "章节ID=7" in preview["output_preview"]
    assert len(preview["output_preview"]) <= 8000 + len("章节ID=7\n")
    assert preview["output_preview"].endswith(preview["output_preview"][-1:])


def test_build_preview_short_content_not_padded():
    from domains.common.gating_service import build_preview

    preview = build_preview("chapter.write", "write_chapter_content", {"chapter_id": 1, "content": "短正文"})
    assert "短正文" in preview["output_preview"]
    assert preview["output_preview"].startswith("章节ID=1")


def test_build_preview_has_tokens_and_elapsed_ms():
    """2.2：审核卡契约与 workflow_runner_node 对齐（tokens/elapsed_ms 字段）。"""
    from domains.common.gating_service import build_preview

    for tool, args in [
        ("write_chapter_content", {"chapter_id": 1, "content": "正文"}),
        ("create_entities", {"characters": []}),
        ("build_outline", {"volumes": []}),
    ]:
        preview = build_preview("op", tool, args)
        assert preview["tokens"] == 0
        assert preview["elapsed_ms"] == 0
        assert preview["node_id"] == tool


# ---------------------------------------------------------------------------
# 1.4：router._sse_review_card 按卡片类型截断
# ---------------------------------------------------------------------------


def test_sse_review_card_chapter_write_allows_8000():
    from domains.agent.router import _sse_review_card

    big = "正" * 5000
    line = _sse_review_card({"node_id": "write_chapter_content", "output_preview": big, "reason": "r"})
    assert "正" * 5000 in line  # 5000 < 8000，不截断
    assert "已截断" not in line


def test_sse_review_card_chapter_write_truncates_above_8000():
    from domains.agent.router import _sse_review_card

    big = "正" * 9000
    line = _sse_review_card({"node_id": "write_chapter_content", "output_preview": big, "reason": "r"})
    assert "正" * 8000 in line
    assert "已截断" in line


def test_sse_review_card_other_cards_still_1000():
    from domains.agent.router import _sse_review_card

    big = "正" * 2000
    line = _sse_review_card({"node_id": "writer_node", "output_preview": big, "reason": "r"})
    assert "已截断" in line
    assert "正" * 1000 in line
    assert "正" * 1001 not in line


# ---------------------------------------------------------------------------
# 2.3：turn_metrics SSE 嵌套结构
# ---------------------------------------------------------------------------


def test_sse_turn_metrics_line_nested():
    import json

    from domains.agent.metrics import sse_turn_metrics_line

    payload = {"thread_id": "t1", "duration_ms": 123, "llm_calls": 2}
    line = sse_turn_metrics_line(payload)
    parsed = json.loads(line[len("data: "):].strip())
    assert parsed["type"] == "turn_metrics"
    assert parsed["metrics"] == payload
    # 旧版平铺契约的字段不应出现在顶层
    assert "llm_calls" not in parsed


# ---------------------------------------------------------------------------
# 2.6：CompressRequest 接受 modelConfig 别名
# ---------------------------------------------------------------------------


def test_compress_request_accepts_model_config_alias():
    from schema.request.common import CompressRequest

    req = CompressRequest(threadId="t1", modelConfig={"main_config": {"api_key": "k"}})
    assert req.thread_id == "t1"
    assert req.model_config_data == {"main_config": {"api_key": "k"}}

    req2 = CompressRequest(thread_id="t1")
    assert req2.model_config_data is None


# ---------------------------------------------------------------------------
# 2.10：checkpoint api_key 剥离（best-effort）
# ---------------------------------------------------------------------------


class _FakeSnap:
    def __init__(self, cfg):
        self.values = {"model_config": cfg}


class _FakeGraph:
    def __init__(self, cfg):
        self.cfg = cfg
        self.updated = None

    async def aget_state(self, config):
        return _FakeSnap(self.cfg)

    async def aupdate_state(self, config, values):
        self.updated = values


@pytest.mark.asyncio
async def test_strip_api_key_removes_key_and_preserves_rest():
    from domains.agent.router import _strip_api_key_from_checkpoint

    cfg = {
        "main_config": {"api_key": "secret", "base_url": "http://x", "model_id": "m"},
        "search_config": {"api_key": "search-secret", "base_url": "http://search"},
    }
    graph = _FakeGraph(cfg)
    await _strip_api_key_from_checkpoint(graph, {"configurable": {"thread_id": "t1"}})

    assert graph.updated is not None
    stripped = graph.updated["model_config"]
    assert stripped["main_config"]["api_key"] == ""
    assert stripped["main_config"]["base_url"] == "http://x"
    assert stripped["main_config"]["model_id"] == "m"
    # 非 main 配置同样剥离密钥（search_config 也含 API Key，防 checkpoint 泄露），
    # 其余字段保留
    assert stripped["search_config"]["api_key"] == ""
    assert stripped["search_config"]["base_url"] == "http://search"


@pytest.mark.asyncio
async def test_strip_api_key_guards_none_graph():
    from domains.agent.router import _strip_api_key_from_checkpoint

    # 不抛异常（respond_to_agent finally 中 graph 可能未绑定）
    await _strip_api_key_from_checkpoint(None, None)


@pytest.mark.asyncio
async def test_strip_api_key_skips_without_main_config():
    from domains.agent.router import _strip_api_key_from_checkpoint

    graph = _FakeGraph({"foo": "bar"})
    await _strip_api_key_from_checkpoint(graph, {})
    assert graph.updated is None
