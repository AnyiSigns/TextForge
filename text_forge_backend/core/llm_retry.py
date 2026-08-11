"""LLM 调用指数退避重试（开放项补全）。

此前依赖 LLM_TIMEOUT + 前端重试；对瞬时故障（超时/429/5xx/连接中断）做
有限次数重试 + 指数退避，降低线上抖动导致的整回合失败率。

- retry_llm：普通 ainvoke 场景（supervisor/chat/压缩/标题/digest）。
- retry_llm_stream：流式场景，仅在「尚未产出任何 chunk」时重试——
  已产出部分内容后的中断重试会破坏流式语义（重复内容），直接上抛。
"""
import asyncio
import inspect

from config.logging import get_logger

logger = get_logger(__name__)

_TRANSIENT_HTTP_CODES = {429, 500, 502, 503, 504}
_DEFAULT_ATTEMPTS = 3
_BASE_DELAY_SECONDS = 1.0


def _transient_err_codes() -> frozenset[str]:
    """可重试的错误码集合（复用 core.errors.ErrCode 常量，避免字符串字面量漂移）。

    网络/超时/限流/服务端错误是瞬时故障，值得退避重试；
    认证/模型不存在/上下文超长/请求被拒是确定性失败，重试无意义。
    延迟到调用时导入，避免 llm_retry 顶层依赖 core.errors（后者引入 openai/httpx）。
    """
    from core.errors import ErrCode

    return frozenset(
        {
            ErrCode.QUOTA_OR_RATE,
            ErrCode.MODEL_TIMEOUT,
            ErrCode.MODEL_NETWORK,
            ErrCode.MODEL_SERVER_ERROR,
        }
    )


def _is_transient(exc: BaseException) -> bool:
    """判断异常是否属于可重试的瞬时故障。

    优先按 HTTP 状态码直接判定（覆盖 openai 兼容 SDK 的 status_code / status），
    其余委托 core.errors.classify_model_error 统一分类，避免与用户侧错误提示
    的关键词表各自维护而漂移。
    """
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return True
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "status", None)
    if status is not None:
        try:
            code = int(status)
        except (TypeError, ValueError):
            code = None
        if code in _TRANSIENT_HTTP_CODES:
            return True
        # 认证/请求错误明确非瞬时，直接短路（避免再走文本兜底误判）
        if code in (400, 401, 403, 404, 405, 422):
            return False
    try:
        from core.errors import classify_model_error

        err_code = classify_model_error(exc).error_code
        return err_code in _transient_err_codes()
    except Exception:
        return False


async def retry_llm(
    coro_factory,
    *,
    attempts: int | None = None,
    base_delay: float | None = None,
    desc: str = "llm",
):
    """对单次 LLM 调用做指数退避重试。

    Args:
        coro_factory: 无参协程工厂（每次重试重新创建调用，避免复用已消费的流）。
        attempts: 最大尝试次数（含首次），缺省 3。
        base_delay: 首次退避秒数，缺省 1.0（第 n 次重试延迟 base_delay * 2^(n-1)）。
        desc: 日志描述。

    Returns:
        与 coro_factory 返回一致的 LLM 输出。

    Raises:
        原异常：非瞬时故障或达到最大尝试次数后原样上抛。
    """
    attempts = max(1, attempts) if attempts is not None else _DEFAULT_ATTEMPTS
    base_delay = base_delay if base_delay is not None else _BASE_DELAY_SECONDS
    for i in range(attempts):
        try:
            return await coro_factory()
        except Exception as exc:
            if not _is_transient(exc) or i == attempts - 1:
                raise
            delay = base_delay * (2**i)
            logger.warning(
                f"[retry_llm] {desc} 第 {i + 1} 次失败（{exc}），{delay:.1f}s 后重试"
            )
            await asyncio.sleep(delay)


async def retry_llm_stream(
    stream_factory,
    *,
    attempts: int | None = None,
    base_delay: float | None = None,
    desc: str = "llm",
):
    """对流式 LLM 调用做指数退避重试（仅在首块前失败时重试）。

    Args:
        stream_factory: 无参返回异步迭代器的工厂。
        attempts: 最大尝试次数（含首次），缺省 3。
        base_delay: 首次退避秒数，缺省 1.0。
        desc: 日志描述。

    Yields:
        流式 chunk。

    Raises:
        原异常：已产出部分 chunk / 非瞬时故障 / 达到最大尝试次数后原样上抛。
    """
    attempts = max(1, attempts) if attempts is not None else _DEFAULT_ATTEMPTS
    base_delay = base_delay if base_delay is not None else _BASE_DELAY_SECONDS
    for i in range(attempts):
        got_chunk = False
        try:
            agen = stream_factory()
            if inspect.isawaitable(agen):
                agen = await agen
            async for item in agen:
                got_chunk = True
                yield item
            return
        except Exception as exc:
            if got_chunk or not _is_transient(exc) or i == attempts - 1:
                raise
            delay = base_delay * (2**i)
            logger.warning(
                f"[retry_llm_stream] {desc} 首块前失败（{exc}），{delay:.1f}s 后重试"
            )
            await asyncio.sleep(delay)
