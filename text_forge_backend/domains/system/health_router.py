from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text

from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    # 向后兼容：保持原空响应
    return {}


@router.head("/health", include_in_schema=False)
async def health_head():
    return Response(status_code=200)


@router.get("/health/live")
async def health_live():
    """存活探针：仅表示进程在运行，不依赖外部服务。"""
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready():
    """就绪探针：探测 DB / Redis / LangGraph checkpointer 可达性。

    任一依赖不可用时返回 503，便于编排器（k8s/nginx）摘流。
    """
    results: dict[str, str] = {}

    # 数据库
    try:
        async with db_manager.async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        results["db"] = "ok"
    except Exception as exc:
        results["db"] = f"error: {exc}"

    # Redis（书籍锁 / RAG 缓存）
    try:
        await redis_client.ping()
        results["redis"] = "ok"
    except Exception as exc:
        results["redis"] = f"error: {exc}"

    # LangGraph 检查点连接池
    try:
        if graph_pool_manager.checkpoint is not None:
            results["graph"] = "ok"
        else:
            results["graph"] = "not_ready"
    except Exception as exc:
        results["graph"] = f"error: {exc}"

    ok = all(v == "ok" for v in results.values())
    return JSONResponse(status_code=200 if ok else 503, content=results)
