import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from config.logging import get_logger
from core.auth import get_current
from core.errors import classify_model_error
from schema.request.model import TestConnectionRequest

logger = get_logger(__name__)
router = APIRouter(prefix="/models", tags=["模型"])

HF_BASE = "https://huggingface.co"
HF_CN = "https://hf-mirror.com"

_client = httpx.AsyncClient(follow_redirects=True, timeout=60)

# transformers.js 在浏览器端获取模型权重时无法携带 Bearer 头，
# embedding 等需跨域下载的模型文件改为经本端点代理转发。
# 为防止代理被滥用，按客户端 IP 做 Redis 计数限流（每分钟上限）。
PROXY_RATE_LIMIT_PER_MINUTE = 120


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


@router.post("/test")
async def test_model_connection(
    body: TestConnectionRequest,
    user_id: int = Depends(get_current),
):
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
        # 仅向前端返回已分类的友好提示（密钥/额度/网络等），不泄露原始异常
        app_exc = classify_model_error(exc)
        logger.error(f"模型连接测试失败 (code={app_exc.error_code}): {exc}")
        raise app_exc


@router.get("/proxy/{path:path}")
async def proxy_hf_model(path: str, request: Request):
    await _check_proxy_rate_limit(request)
    # 只允许转发 HuggingFace 资源路径，禁止路径中携带协议/域名注入
    if path.startswith("http://") or path.startswith("https://") or "://" in path or path.startswith("//"):
        raise HTTPException(status_code=400, detail="非法的代理路径")
    urls = []
    if path.startswith("api/"):
        urls.append(f"{HF_BASE}/{path}")
        urls.append(f"{HF_CN}/{path}")
    else:
        urls.append(f"{HF_BASE}/{path}")
        urls.append(f"{HF_CN}/{path}")

    last_err = None
    for url in urls:
        try:
            resp = await _client.get(url)
            if resp.status_code == 200:
                return Response(content=resp.content, media_type=resp.headers.get("content-type", "application/octet-stream"))
            last_err = f"{url} -> {resp.status_code}"
        except Exception as exc:
            last_err = f"{url} -> {exc}"

    logger.error(f"模型文件代理失败: {path}, 上游: {last_err}")
    raise HTTPException(status_code=502, detail="模型文件获取失败")
