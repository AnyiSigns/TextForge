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
    embedding_dim: int | None = None,
) -> list[dict[str, Any]] | None:
    """RAG 检索缓存读取。

    Args:
        query: 查询文本。
        query_embedding: 查询向量。
        rag_filter: 过滤条件。
        top_k: 返回结果数。
        ttl: 缓存过期时间（秒）。
        embedding_dim: 嵌入维度，并入缓存键避免不同嵌入模型（维度不同）命中彼此缓存。

    Returns:
        缓存结果列表，未命中返回 None。
    """
    filter_key = json.dumps(rag_filter, sort_keys=True, ensure_ascii=False)
    # 把嵌入维度并入键：不同用户/模型维度不同，仅按 query 文本缓存会串味。
    dim_key = f":dim={embedding_dim}" if embedding_dim is not None else ":dim=none"
    # top_k 并入键：不同返回条数应命中各自缓存，否则 top_k=3 的结果会被 top_k=5 误用（S8）。
    topk_key = f":k={top_k}"
    cache_key = f"rag:{hashlib.md5((query + filter_key + dim_key + topk_key).encode()).hexdigest()}"
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
    embedding_dim: int | None = None,
):
    """写入 RAG 检索缓存。

    Args:
        query: 查询文本。
        rag_filter: 过滤条件。
        results: 检索结果。
        ttl: 缓存过期时间（秒）。
        embedding_dim: 嵌入维度，并入缓存键，需与 cached_rag_search 保持一致。
    """
    filter_key = json.dumps(rag_filter, sort_keys=True, ensure_ascii=False)
    dim_key = f":dim={embedding_dim}" if embedding_dim is not None else ":dim=none"
    # top_k 并入键：需与 cached_rag_search 保持一致（S8）。
    topk_key = f":k={top_k}"
    cache_key = f"rag:{hashlib.md5((query + filter_key + dim_key + topk_key).encode()).hexdigest()}"
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
