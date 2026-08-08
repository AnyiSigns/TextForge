import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from config.logging import get_logger
from core.auth import get_current
from schema.request.model import TestConnectionRequest

logger = get_logger(__name__)
router = APIRouter(prefix="/models", tags=["模型配置"])

HF_BASE = "https://huggingface.co"
HF_CN = "https://hf-mirror.com"

_client = httpx.AsyncClient(follow_redirects=True, timeout=60)

# 代理保持匿名：浏览器端 transformers.js 拉取模型权重无法携带 Bearer 头
# （embedding 本地推理依赖该代理）。为防止被当作免费镜像滥用（带宽攻击），
# 按 IP 做 Redis 令牌桶限流；正常模型下载为多文件大体积但请求数低，不受影响。
PROXY_RATE_LIMIT_PER_MINUTE = 120


async def _check_proxy_rate_limit(request: Request) -> None:
    """按客户端 IP 对 /models/proxy 做限流，超限返回 429。

    Args:
        request: 当前请求（用于取客户端 IP）。

    Raises:
        HTTPException: 超过每分钟请求上限时抛出 429。
    """
    from shared.redis import redis_client

    try:
        client_ip = request.client.host if request.client else "unknown"
        key = f"models:proxy:rate:{client_ip}"
        # INCR + 首次设置过期：简单计数限流，60 秒窗口
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 60)
        results = await pipe.execute()
        count = int(results[0])
        if count > PROXY_RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"代理限流检查失败（放行）: {exc}")


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
        logger.error(f"模型连接测试失败: {exc}")
        raise HTTPException(status_code=400, detail=f"连接失败：{exc}")


@router.get("/proxy/{path:path}")
async def proxy_hf_model(path: str, request: Request):
    await _check_proxy_rate_limit(request)
    # 仅允许代理到固定的 HuggingFace 镜像，禁止路径中的协议/主机注入
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

    logger.error(f"模型文件代理失败: {path}, 最后错误: {last_err}")
    raise HTTPException(status_code=502, detail="模型文件获取失败")
