from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from model.web_search_cache import WebSearchCache
from utils.logger import get_logger
import hashlib

logger = get_logger(__name__)


class WebSearchService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def search(self, query: str, api_key: str, top_k: int = 5, use_cache: bool = True) -> List[dict]:
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        if use_cache:
            cached = await self._get_cache(query_hash)
            if cached is not None:
                return cached
        results = await self._search_bocha(query, api_key, top_k)
        if use_cache and results:
            try:
                await self._save_cache(query, query_hash, results)
            except Exception as exc:
                logger.warning(f"web_search 缓存保存失败: {exc}")
        return results

    async def _search_bocha(self, query: str, api_key: str, top_k: int) -> List[dict]:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(
                    "https://api.bochaai.com/v1/web/search",
                    params={"q": query, "count": top_k},
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                res.raise_for_status()
                data = res.json()
                return [
                    {
                        "title": r.get("title", ""),
                        "snippet": r.get("summary", ""),
                        "url": r.get("url", ""),
                    }
                    for r in (data.get("data") or {}).get("results", [])[:top_k]
                ]
        except Exception as exc:
            logger.warning(f"web_search 失败: {exc}")
            return [{"error": str(exc), "query": query}]

    async def _get_cache(self, query_hash: str) -> Optional[List[dict]]:
        stmt = select(WebSearchCache).where(WebSearchCache.query_hash == query_hash)
        result = await self.session.execute(stmt)
        cache = result.scalar_one_or_none()
        if cache:
            cache.hit_count += 1
            await self.session.commit()
            return cache.results
        return None

    async def _save_cache(self, query: str, query_hash: str, results: List[dict]):
        cache = WebSearchCache(
            query=query,
            query_hash=query_hash,
            results=results,
        )
        self.session.add(cache)
        await self.session.flush()
