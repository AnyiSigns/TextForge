import redis.asyncio as redis
from config.settings import settings
import json
import hashlib
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    decode_responses=True,
)


async def cached_rag_search(
    query: str,
    query_embedding: List[float],
    rag_filter: Dict[str, Any],
    top_k: int = 3,
    ttl: int = 3600,
) -> Optional[List[Dict[str, Any]]]:
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
    rag_filter: Dict[str, Any],
    results: List[Dict[str, Any]],
    ttl: int = 3600,
):
    filter_key = json.dumps(rag_filter, sort_keys=True, ensure_ascii=False)
    cache_key = f"rag:{hashlib.md5((query + filter_key).encode()).hexdigest()}"
    try:
        await redis_client.setex(cache_key, ttl, json.dumps(results, ensure_ascii=False))
    except Exception as exc:
        logger.warning(f"Redis 写入缓存失败: {exc}")


async def delete_rag_cache(pattern: str = "rag:*"):
    try:
        keys = []
        async for key in redis_client.scan_iter(pattern):
            keys.append(key)
        if keys:
            await redis_client.delete(*keys)
    except Exception as exc:
        logger.warning(f"Redis 删除缓存失败: {exc}")
