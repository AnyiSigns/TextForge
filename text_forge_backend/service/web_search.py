from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from model.web_search_cache import WebSearchCache
from utils.logger import get_logger
import hashlib

logger = get_logger(__name__)


class WebSearchService:
    """网页搜索服务层。

    集成博查搜索 API，并支持本地缓存降低重复查询成本。
    """

    def __init__(self, session: AsyncSession):
        """初始化 WebSearchService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def search(self, query: str, api_key: str, top_k: int = 5, use_cache: bool = True) -> List[dict]:
        """执行网页搜索，优先返回缓存结果。

        Args:
            query: 搜索关键词。
            api_key: 博查 API Key。
            top_k: 返回结果数。
            use_cache: 是否使用缓存。

        Returns:
            搜索结果列表，每个元素包含 title、snippet、url。
        """
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
        """调用博查搜索 API。

        Args:
            query: 搜索关键词。
            api_key: API Key。
            top_k: 返回结果数。

        Returns:
            搜索结果列表，失败返回错误信息列表。
        """
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
        """查询搜索缓存。

        Args:
            query_hash: 查询哈希。

        Returns:
            缓存结果列表，不存在返回 None。
        """
        stmt = select(WebSearchCache).where(WebSearchCache.query_hash == query_hash)
        result = await self.session.execute(stmt)
        cache = result.scalar_one_or_none()
        if cache:
            cache.hit_count += 1
            await self.session.commit()
            return cache.results
        return None

    async def _save_cache(self, query: str, query_hash: str, results: List[dict]):
        """保存搜索缓存。

        Args:
            query: 原始查询。
            query_hash: 查询哈希。
            results: 搜索结果。
        """
        cache = WebSearchCache(
            query=query,
            query_hash=query_hash,
            results=results,
        )
        self.session.add(cache)
        await self.session.flush()
        await self.session.refresh(cache)
