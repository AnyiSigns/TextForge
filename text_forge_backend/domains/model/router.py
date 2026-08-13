import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from config.logging import get_logger
from core.auth import get_current
from core.errors import classify_model_error
from schema.request.model import TestConnectionRequest
from shared.utils import is_public_http_url

logger = get_logger(__name__)
router = APIRouter(prefix="/models", tags=["模型"])

HF_BASE = "https://huggingface.co"
HF_CN = "https://hf-mirror.com"

# 模块级长连接池：代理端点高频命中同一批上游主机，复用连接避免每请求握手。
# 生命周期随进程（不在 lifespan 关闭）：本 client 无状态、不持有业务资源，
# 进程退出时由 OS 回收连接；若后续需要优雅关闭，可在 app lifespan 中 aclose。
# 超时按「流式大文件下载」设置：连接快失败，读取给足单块等待时间。
_client = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(connect=15.0, read=120.0, write=60.0, pool=60.0),
)

# transformers.js 在浏览器端获取模型权重时无法携带 Bearer 头，
# embedding 等需跨域下载的模型文件改为经本端点代理转发。
# 为防止代理被滥用，按客户端 IP 做 Redis 计数限流（每分钟上限）。
PROXY_RATE_LIMIT_PER_MINUTE = 120

# 允许代理的模型仓库前缀：与前端 EMBED_TIERS（src/lib/rag/embed.ts）的 model 字段一致。
# 新增向量模型档位时必须同步登记，否则代理返回 403。
ALLOWED_MODEL_REPOS = (
    "Xenova/bge-small-zh-v1.5",
    "Xenova/bge-base-zh-v1.5",
    "Xenova/bge-large-zh-v1.5",
)

# 允许透传的模型文件扩展名（权重 / 配置 / 词表）
ALLOWED_FILE_SUFFIXES = (
    ".json",
    ".onnx",
    ".onnx_data",
    ".bin",
    ".txt",
    ".model",
)

# 上游 → 客户端需要透传的响应头（断点续传 / 协商缓存 / 原始编码）
_PASSTHROUGH_HEADERS = (
    "content-length",
    "content-encoding",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
)

# 客户端 → 上游需要透传的请求头（断点续传 / 协商缓存）
_FORWARD_REQUEST_HEADERS = ("range", "if-range", "if-none-match", "if-modified-since")


async def _check_proxy_rate_limit(request: Request) -> None:
    """按客户端 IP 对 /models/proxy 请求限流，超出返回 429。

    Args:
        request: 当前请求对象（取客户端 IP）。

    Raises:
        HTTPException: 超过每分钟上限时抛出 429。
    """
    from shared.redis import redis_client

    try:
        client_ip = request.client.host if request.client else "unknown"
        key = f"models:proxy:rate:{client_ip}"
        # INCR + 首次设置过期时间，实现简单的 60 秒窗口计数
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 60)
        results = await pipe.execute()
        count = int(results[0])
        if count > PROXY_RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"代理限流检查失败，放行: {exc}")


def _assert_allowed_proxy_path(path: str) -> None:
    """校验代理路径：只允许白名单模型仓库下的模型文件。

    Args:
        path: 代理路径（形如 `Xenova/bge-base-zh-v1.5/resolve/main/config.json`）。

    Raises:
        HTTPException: 路径非法（400）或不在白名单内（403）。
    """
    if not path or "://" in path or path.startswith("//") or "\\" in path or "\x00" in path:
        raise HTTPException(status_code=400, detail="非法的代理路径")
    segments = path.split("/")
    # 拒绝目录穿越与隐藏文件（.. / .git 等）
    if any(not seg or seg.startswith(".") for seg in segments):
        raise HTTPException(status_code=400, detail="非法的代理路径")
    if not any(path.startswith(f"{repo}/") for repo in ALLOWED_MODEL_REPOS):
        raise HTTPException(status_code=403, detail="不允许代理该模型路径")
    file_name = segments[-1]
    if not file_name.endswith(ALLOWED_FILE_SUFFIXES):
        raise HTTPException(status_code=403, detail="不允许代理该文件类型")


@router.post("/test")
async def test_model_connection(
    body: TestConnectionRequest,
    user_id: int = Depends(get_current),
):
    # SSRF 防护：只允许连接公网可达的 http/https 地址，
    # 禁止把已鉴权用户的请求转发到内网/环回/云元数据地址。
    if not is_public_http_url(body.base_url):
        raise HTTPException(status_code=400, detail="不支持的服务器地址")
    try:
        from core.model_factory import ModelWrapper

        config = {
            "adapter": body.adapter,
            "base_url": body.base_url,
            "api_key": body.api_key,
            "model_id": body.model_id,
        }
        model = ModelWrapper.get_model(config)
        result = await model.ainvoke("hello")
        return {"ok": True, "content": getattr(result, "content", str(result))}
    except Exception as exc:
        # 仅向前端返回已分类的友好提示（密钥/额度/网络等），不泄露原始异常。
        # 日志同样不拼接原始异常文本：模型 SDK 异常常回显请求体（含 api_key）。
        app_exc = classify_model_error(exc)
        logger.error(f"模型连接测试失败 (code={app_exc.error_code})")
        raise app_exc


@router.get("/proxy/{path:path}")
async def proxy_hf_model(path: str, request: Request):
    """流式转发白名单模型文件（HuggingFace 官方站 → 国内镜像容灾）。

    设计边界（有意为之）：
    - **无鉴权**：浏览器端 transformers.js 通过 `env.remoteHost` 直接发起权重
      下载请求，无法携带 Bearer 头，因此该端点不接 get_current。滥用风险由
      「仓库/文件白名单（ALLOWED_MODEL_REPOS）+ 按 IP 限流」共同收敛：
      只能取到固定几个公开 embedding 模型的只读文件，无法当作通用外网代理。
    - **流式转发**：按块转发上游响应，不把整包权重（最大约 320MB）读进内存。
    - 透传 Range / 协商缓存相关请求头与响应头，支持断点续传与浏览器缓存复用。

    Args:
        path: 模型文件相对路径。
        request: 当前请求（用于限流与请求头透传）。

    Returns:
        上游响应的流式转发结果。

    Raises:
        HTTPException: 路径非法/不在白名单/限流命中/上游全部失败。
    """
    await _check_proxy_rate_limit(request)
    _assert_allowed_proxy_path(path)

    fwd_headers = {
        k: v for k, v in request.headers.items() if k.lower() in _FORWARD_REQUEST_HEADERS
    }

    last_err = None
    for url in (f"{HF_BASE}/{path}", f"{HF_CN}/{path}"):
        upstream = None
        try:
            req = _client.build_request("GET", url, headers=fwd_headers)
            upstream = await _client.send(req, stream=True)
            if upstream.status_code not in (200, 206, 304):
                last_err = f"{url} -> {upstream.status_code}"
                await upstream.aclose()
                continue

            headers = {
                k: v
                for k, v in upstream.headers.items()
                if k.lower() in _PASSTHROUGH_HEADERS
            }
            media_type = upstream.headers.get("content-type", "application/octet-stream")
            if upstream.status_code == 304:
                # 命中协商缓存：无响应体，剔除与实体长度相关的头后直接返回
                await upstream.aclose()
                return Response(
                    status_code=304,
                    headers={
                        k: v
                        for k, v in headers.items()
                        if k.lower() not in ("content-length", "content-encoding")
                    },
                )

            async def _body(resp=upstream):
                # aiter_raw：原样转发上游字节（不解压），与透传的
                # content-encoding / content-length 头保持一致
                try:
                    async for chunk in resp.aiter_raw():
                        yield chunk
                finally:
                    await resp.aclose()

            return StreamingResponse(
                _body(),
                status_code=upstream.status_code,
                headers=headers,
                media_type=media_type,
            )
        except Exception as exc:
            last_err = f"{url} -> {exc}"
            if upstream is not None:
                try:
                    await upstream.aclose()
                except Exception:
                    pass

    logger.error(f"模型文件代理失败: {path}, 上游: {last_err}")
    raise HTTPException(status_code=502, detail="模型文件获取失败")
