"""LLM 指数退避重试测试（扩展）。

覆盖：
- retry_llm：瞬时故障重试成功 / 非瞬时不重试 / 超限上抛
- retry_llm_stream：首块前失败重试 / 已产块不重试
"""

from __future__ import annotations

import asyncio

import pytest

from core.llm_retry import _is_transient, retry_llm, retry_llm_stream


class _Flaky:
    def __init__(self, fail_times: int, exc: Exception):
        self.calls = 0
        self.fail_times = fail_times
        self.exc = exc

    async def run(self):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise self.exc
        return "ok"


class _FlakyStream:
    def __init__(self, fail_times: int):
        self.calls = 0
        self.fail_times = fail_times

    async def stream(self):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise TimeoutError("上游超时")
        yield "chunk-a"
        yield "chunk-b"


# ---------------------------------------------------------------------------
# _is_transient
# ---------------------------------------------------------------------------


def test_is_transient_timeout():
    assert _is_transient(TimeoutError("timeout"))
    assert _is_transient(asyncio.TimeoutError())


def test_is_transient_http_status():
    class _RespErr(Exception):
        status_code = 429

    assert _is_transient(_RespErr())
    assert not _is_transient(ValueError("bad request"))


def test_is_transient_message_keywords():
    class _E(Exception):
        pass

    assert _is_transient(_E("connection reset"))
    assert _is_transient(_E("服务暂时不可用"))
    assert not _is_transient(_E("Field required"))


# ---------------------------------------------------------------------------
# retry_llm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_llm_succeeds_after_transient_failures():
    flaky = _Flaky(2, TimeoutError("timeout"))
    result = await retry_llm(flaky.run, attempts=3, base_delay=0.01)
    assert result == "ok"
    assert flaky.calls == 3


@pytest.mark.asyncio
async def test_retry_llm_non_transient_raises_immediately():
    flaky = _Flaky(5, ValueError("Field required"))
    with pytest.raises(ValueError):
        await retry_llm(flaky.run, attempts=3, base_delay=0.01)
    assert flaky.calls == 1


@pytest.mark.asyncio
async def test_retry_llm_exhausts_attempts():
    flaky = _Flaky(10, TimeoutError("timeout"))
    with pytest.raises(TimeoutError):
        await retry_llm(flaky.run, attempts=2, base_delay=0.01)
    assert flaky.calls == 2


# ---------------------------------------------------------------------------
# retry_llm_stream
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_llm_stream_retries_before_first_chunk():
    flaky = _FlakyStream(fail_times=1)

    async def factory():
        return flaky.stream()

    got = [c async for c in retry_llm_stream(factory, attempts=3, base_delay=0.01)]
    assert got == ["chunk-a", "chunk-b"]
    assert flaky.calls == 2


@pytest.mark.asyncio
async def test_retry_llm_stream_no_retry_after_partial_output():
    class _MidFail:
        calls = 0

        async def stream(self):
            self.calls += 1
            yield "已产出"
            raise TimeoutError("中途超时")

    flaky = _MidFail()

    async def factory():
        return flaky.stream()

    got = []
    with pytest.raises(TimeoutError):
        async for c in retry_llm_stream(factory, attempts=3, base_delay=0.01):
            got.append(c)
    assert got == ["已产出"]  # 已产块不重试，避免重复内容
    assert flaky.calls == 1
