import hashlib
import json
import logging
from typing import Any
import redis.asyncio as redis
from config.settings import settings

logger = logging.getLogger(__name__)

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    decode_responses=True,
    max_connections=20,
    retry_on_timeout=True,
    socket_keepalive=True,
)


async def cached_rag_search(
    query: str,
    query_embedding: list[float],
    rag_filter: dict[str, Any],
    top_k: int = 3,
    ttl: int = 3600,
) -> list[dict[str, Any]] | None:
    """RAG 检索缓存读取。

    Args:
        query: 查询文本。
        query_embedding: 查询向量。
        rag_filter: 过滤条件。
        top_k: 返回结果数。
        ttl: 缓存过期时间（秒）。

    Returns:
        缓存结果列表，未命中返回 None。
    """
    filter_key = json.dumps(rag_filter, sort_keys=True, ensure_ascii=False)
    cache_key = f"rag:{hashlib.md5((query + filter_key).encode()).hexdigest()}"
    try:
        cached = await redis_client.get(cache_key)
        if cached is not None:
            return json.loads(cached)
    except Exception as exc:
        logger.warning(f"Redis 读取缓存失败: {exc}")
    return None


async def set_rag_cache(
    query: str,
    rag_filter: dict[str, Any],
    results: list[dict[str, Any]],
    ttl: int = 3600,
):
    """写入 RAG 检索缓存。

    Args:
        query: 查询文本。
        rag_filter: 过滤条件。
        results: 检索结果。
        ttl: 缓存过期时间（秒）。
    """
    filter_key = json.dumps(rag_filter, sort_keys=True, ensure_ascii=False)
    cache_key = f"rag:{hashlib.md5((query + filter_key).encode()).hexdigest()}"
    try:
        await redis_client.setex(
            cache_key, ttl, json.dumps(results, ensure_ascii=False)
        )
    except Exception as exc:
        logger.warning(f"Redis 写入缓存失败: {exc}")


async def delete_rag_cache(pattern: str = "rag:*"):
    """删除 RAG 缓存。

    Args:
        pattern: Redis key 匹配模式。
    """
    try:
        keys = []
        async for key in redis_client.scan_iter(pattern):
            keys.append(key)
        if keys:
            await redis_client.delete(*keys)
    except Exception as exc:
        logger.warning(f"Redis 删除缓存失败: {exc}")
