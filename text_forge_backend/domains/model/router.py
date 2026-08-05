from schema.request.model import TestConnectionRequest
from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
import httpx

logger = get_logger(__name__)
router = APIRouter(prefix="/models", tags=["模型配置"])

HF_BASE = "https://huggingface.co"
HF_CN = "https://hf-mirror.com"

_client = httpx.AsyncClient(follow_redirects=True, timeout=60)


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
async def proxy_hf_model(path: str):
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
