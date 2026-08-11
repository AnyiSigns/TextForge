"""统一、用户友好的错误处理层。

设计原则（重要）：
- **用户行为导致的、可自助解决的错误**（参数校验、密码错误、API Key 无效、
  额度/频率超限、文件过大/格式不支持、网络不通、超时、上下文超长）才向前端
  返回**具体且友好**的提示文案与可操作建议（hint）。
- **内部错误**（数据库异常、未预期的代码异常等）只返回**通用**友好文案
  （如「服务器开小差了，请稍后重试」），**绝不**把原始异常信息（SQL、堆栈、
  内部路径等）泄露给前端。原始细节仅记录到服务端日志。
"""

import asyncio
import httpx
import openai
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config.logging import get_logger, request_id_var
from core.exceptions import AppException

logger = get_logger(__name__)


# ── 错误码 ────────────────────────────────────────────────────────────────
class ErrCode:
    INVALID_API_KEY = "INVALID_API_KEY"
    QUOTA_OR_RATE = "QUOTA_OR_RATE"
    MODEL_TIMEOUT = "MODEL_TIMEOUT"
    MODEL_NETWORK = "MODEL_NETWORK"
    MODEL_CONTEXT = "MODEL_CONTEXT"
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    MODEL_REJECTED = "MODEL_REJECTED"
    MODEL_SERVER_ERROR = "MODEL_SERVER_ERROR"
    MODEL_UNKNOWN = "MODEL_UNKNOWN"
    DB_ERROR = "DB_ERROR"
    DB_CONFLICT = "DB_CONFLICT"
    FILE_EMPTY = "FILE_EMPTY"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_TYPE = "FILE_TYPE"
    FILE_ENCODING = "FILE_ENCODING"
    VALIDATION = "VALIDATION_ERROR"
    INTERNAL = "INTERNAL_ERROR"


# 各错误码对应的可操作建议（hint），前端按 error_code 取出展示
ERROR_HINTS: dict[str, str] = {
    ErrCode.INVALID_API_KEY: "请到「设置 → 模型」检查并重新填写 API Key。",
    ErrCode.QUOTA_OR_RATE: "请检查模型服务商的账户余额或调用额度，稍后重试。",
    ErrCode.MODEL_TIMEOUT: "可稍后重试，或调大「设置 → 模型」中的请求超时时间。",
    ErrCode.MODEL_NETWORK: "请确认 base_url 正确，且服务器能访问该地址（必要时配置代理）。",
    ErrCode.MODEL_CONTEXT: "请精简输入，或开启上下文压缩 / 新建会话后再试。",
    ErrCode.MODEL_NOT_FOUND: "请检查「设置 → 模型」中的模型名称（model_id）是否填写正确。",
    ErrCode.MODEL_REJECTED: "请检查输入内容是否合规，或修改模型参数后重试。",
    ErrCode.MODEL_SERVER_ERROR: "模型服务端暂时不可用，请稍后重试。",
    ErrCode.MODEL_UNKNOWN: "请检查模型配置（base_url / model_id / API Key）后重试。",
    ErrCode.DB_CONFLICT: "数据冲突，请刷新页面后重试。",
    ErrCode.FILE_EMPTY: "请上传非空的有效文件。",
    ErrCode.FILE_TOO_LARGE: "文件体积过大，请压缩或拆分为更小的文件后重试。",
    ErrCode.FILE_TYPE: "仅支持 TXT / Markdown / JSON / CSV 文档，或 JPG / PNG / WebP / GIF 图片。",
    ErrCode.FILE_ENCODING: "暂不支持该文件编码，请使用 UTF-8 编码后重试。",
}


def _norm_text(exc: Exception) -> str:
    """取异常文本（尽量简短、去掉换行）。"""
    text = getattr(exc, "message", None) or getattr(exc, "body", None)
    if isinstance(text, dict):
        text = str(text.get("message") or text.get("error") or text)
    if not text:
        text = str(exc)
    return text.replace("\n", " ").strip()


def classify_model_error(exc: Exception) -> AppException:
    """把模型（LLM）调用异常分类为友好的 AppException。

    仅当用户可自助解决（密钥/额度/网络/超时/上下文）时才给出具体原因；
    无法识别的模型错误返回通用文案，不泄露原始异常细节。
    """
    status = getattr(exc, "status_code", None)
    text = _norm_text(exc).lower()

    # 1) 根据 HTTP 状态码判断（openai / openai 兼容）
    if status is not None:
        if status in (401, 403):
            return AppException(400, "API Key 无效或权限不足。", ErrCode.INVALID_API_KEY)
        if status == 404:
            return AppException(400, "模型不存在或已下线。", ErrCode.MODEL_NOT_FOUND)
        if status == 429:
            return AppException(429, "模型调用频率超限或额度已用尽。", ErrCode.QUOTA_OR_RATE)
        if status == 400:
            if any(k in text for k in ("context length", "maximum context", "too many tokens", "token limit")):
                return AppException(400, "输入内容超出模型上下文长度上限。", ErrCode.MODEL_CONTEXT)
            return AppException(400, "请求被模型服务拒绝。", ErrCode.MODEL_REJECTED)
        if status >= 500:
            return AppException(502, "模型服务暂时不可用。", ErrCode.MODEL_SERVER_ERROR)

    # 2) 根据异常类型判断
    if isinstance(exc, openai.APIConnectionError):
        return AppException(502, "无法连接模型服务。", ErrCode.MODEL_NETWORK)
    if isinstance(exc, (openai.APITimeoutError, asyncio.TimeoutError)):
        return AppException(504, "模型响应超时。", ErrCode.MODEL_TIMEOUT)
    if isinstance(exc, openai.AuthenticationError):
        return AppException(400, "API Key 无效或权限不足。", ErrCode.INVALID_API_KEY)
    if isinstance(exc, openai.RateLimitError):
        return AppException(429, "模型调用频率超限或额度已用尽。", ErrCode.QUOTA_OR_RATE)
    if isinstance(exc, openai.InternalServerError):
        return AppException(502, "模型服务暂时不可用。", ErrCode.MODEL_SERVER_ERROR)

    # 3) 文本模式兜底（anthropic / gemini / 其它 provider 或包装异常）
    if any(k in text for k in ("api key", "apikey", "authentication", "unauthorized", "401", "permission")):
        return AppException(400, "API Key 无效或权限不足。", ErrCode.INVALID_API_KEY)
    if any(k in text for k in ("quota", "rate limit", "rate_limit", "too many requests", "429", "限流", "频率超限", "额度")):
        return AppException(429, "模型调用频率超限或额度已用尽。", ErrCode.QUOTA_OR_RATE)
    if any(k in text for k in ("context length", "maximum context", "too many tokens", "token limit")):
        return AppException(400, "输入内容超出模型上下文长度上限。", ErrCode.MODEL_CONTEXT)
    if any(k in text for k in ("timeout", "timed out", "deadline", "超时")):
        return AppException(504, "模型响应超时。", ErrCode.MODEL_TIMEOUT)
    if any(k in text for k in ("connection", "connect", "resolve", "refused", "network", "base_url", "name or service not known", "getaddrinfo", "网络", "连接")):
        return AppException(502, "无法连接模型服务。", ErrCode.MODEL_NETWORK)
    # 服务端瞬时故障（国内 MaaS 常见中文错误文案）→ 归类为可重试的服务端错误
    if any(k in text for k in ("overloaded", "server error", "service unavailable", "暂时", "不可用", "繁忙", "过载")):
        return AppException(502, "模型服务暂时不可用。", ErrCode.MODEL_SERVER_ERROR)

    # 4) 无法识别：不泄露原始异常，返回通用文案
    return AppException(502, "模型调用失败，请检查模型配置后重试。", ErrCode.MODEL_UNKNOWN)


def classify_db_error(exc: Exception) -> AppException:
    """数据库异常统一归类为内部错误，不向前端泄露 SQL / 堆栈。"""
    from sqlalchemy.exc import IntegrityError, SQLAlchemyError

    if isinstance(exc, IntegrityError):
        return AppException(409, "数据冲突，请刷新页面后重试。", ErrCode.DB_CONFLICT)
    if isinstance(exc, SQLAlchemyError):
        logger.error(f"数据库异常: {exc}", exc_info=True)
        return AppException(500, "数据保存失败，请稍后重试。", ErrCode.DB_ERROR)
    logger.error(f"数据访问异常: {exc}", exc_info=True)
    return AppException(500, "数据保存失败，请稍后重试。", ErrCode.DB_ERROR)


def classify_upload_error(exc: Exception) -> AppException:
    """文件上传过程中的可控异常 → 具体友好提示。"""
    msg = _norm_text(exc)
    if "文件内容为空" in msg or "empty" in msg.lower():
        return AppException(400, "文件内容为空。", ErrCode.FILE_EMPTY)
    if "文件编码" in msg or "encoding" in msg.lower():
        return AppException(400, "暂不支持该文件编码。", ErrCode.FILE_ENCODING)
    return AppException(400, "文件处理失败，请检查文件后重试。", ErrCode.FILE_TYPE)


def classify_agent_error(exc: Exception) -> AppException:
    """Agent 执行（图运行 / 工具调用）过程中的异常分类。

    优先识别模型相关异常并给出可操作提示；数据库异常归类为内部冲突；
    其它未知异常只返回通用文案，绝不泄露内部堆栈。
    """
    from sqlalchemy.exc import SQLAlchemyError

    if isinstance(
        exc,
        (
            openai.OpenAIError,
            httpx.HTTPError,
            asyncio.TimeoutError,
            ConnectionError,
            OSError,
        ),
    ):
        return classify_model_error(exc)
    try:
        from sqlalchemy.exc import IntegrityError

        if isinstance(exc, (IntegrityError, SQLAlchemyError)):
            return classify_db_error(exc)
    except ImportError:
        pass
    logger.error(f"Agent 执行异常: {exc}", exc_info=True)
    return AppException(500, "生成失败，请稍后重试。", ErrCode.INTERNAL)


def _format_validation(exc: RequestValidationError) -> str:
    """把 Pydantic/FastAPI 校验错误转成中文友好文案。"""
    parts: list[str] = []
    for err in exc.errors():
        loc = err.get("loc", [])
        # loc 形如 ('body', 'email') 或 ('query', 'page')，去掉首位容器名
        field = ".".join(str(p) for p in loc[1:]) if len(loc) > 1 else (str(loc[0]) if loc else "")
        etype = err.get("type", "")
        raw_msg = err.get("msg", "")
        if etype == "missing":
            parts.append(f"{field} 不能为空" if field else "缺少必填参数")
        elif etype in ("string_too_short", "string_too_long"):
            ctx = err.get("ctx", {})
            limit = ctx.get("min_length") or ctx.get("max_length")
            if etype == "string_too_short":
                parts.append(f"{field} 长度不能少于 {limit} 个字符" if field else f"长度不能少于 {limit} 个字符")
            else:
                parts.append(f"{field} 长度不能超过 {limit} 个字符" if field else f"长度不能超过 {limit} 个字符")
        elif etype.startswith("value_error") or etype.startswith("string"):
            parts.append(f"{field} 格式不正确" if field else raw_msg)
        elif etype.startswith("type_error"):
            parts.append(f"{field} 类型不正确" if field else raw_msg)
        else:
            parts.append(f"{field} {raw_msg}" if field else raw_msg)
    return "请求参数有误：" + "；".join(parts) if parts else "请求参数有误"


def _code_for_status(status_code: int) -> str:
    return {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        415: "UNSUPPORTED_MEDIA",
        422: ErrCode.VALIDATION,
        429: "TOO_MANY_REQUESTS",
        500: ErrCode.INTERNAL,
        502: "BAD_GATEWAY",
        503: "SERVICE_UNAVAILABLE",
        504: "GATEWAY_TIMEOUT",
    }.get(status_code, ErrCode.INTERNAL)


def register_exception_handlers(app) -> None:
    """注册全局异常处理：AppException / HTTPException / 校验错误 / 未捕获异常。

    关键：未捕获异常只返回通用文案，原始异常仅记录到服务端日志。
    """

    @app.exception_handler(AppException)
    async def _handle_app_exc(_: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "error_code": exc.error_code},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_exc(_: Request, exc: StarletteHTTPException):
        # AppException 已在上面的处理器中处理；这里处理裸 HTTPException。
        # detail 可能是字符串或 dict，原样透传给前端（业务层已写好友好文案）。
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "error_code": _code_for_status(exc.status_code)},
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": _format_validation(exc), "error_code": ErrCode.VALIDATION},
        )

    @app.exception_handler(Exception)
    async def _handle_unhandled(request: Request, exc: Exception):
        try:
            rid = request_id_var.get()
        except LookupError:
            rid = None
        logger.error(f"未处理的异常 (request_id={rid}): {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "服务器开小差了，请稍后重试。", "error_code": ErrCode.INTERNAL},
        )
