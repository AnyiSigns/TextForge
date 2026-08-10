import hashlib
from datetime import datetime, timedelta

from sqlalchemy import delete as sqla_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from models.web_search_cache import WebSearchCache

logger = get_logger(__name__)

# 搜索缓存有效期：24 小时（博查结果时效性有限，超期需重新搜索）
_CACHE_TTL_HOURS = 24


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

    async def search(self, query: str, api_key: str, top_k: int = 5, use_cache: bool = True) -> list[dict]:
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

    async def _search_bocha(self, query: str, api_key: str, top_k: int) -> list[dict]:
        """调用博查搜索 API（POST /v1/web-search，JSON body）。

        Args:
            query: 搜索关键词。
            api_key: API Key。
            top_k: 返回结果数。

        Returns:
            搜索结果列表，失败返回带具体原因的错误信息列表。
        """
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.post(
                    "https://api.bochaai.com/v1/web-search",
                    json={"query": query, "count": top_k, "summary": True, "freshness": "noLimit"},
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                )
                if res.status_code != 200:
                    # 按状态码区分错误原因（错误信息具体化，且避免被 quality_gate 计为工具失败）
                    if res.status_code in (401, 403):
                        return [{"error": "博查搜索 API Key 无效或无权限，请检查模型配置中的搜索 key", "query": query}]
                    if res.status_code == 429:
                        return [{"error": "博查搜索触发限流，请稍后重试", "query": query}]
                    if res.status_code >= 500:
                        return [{"error": "博查搜索服务暂时不可用，请稍后重试", "query": query}]
                    return [{"error": f"博查搜索失败（HTTP {res.status_code}）", "query": query}]
                data = res.json()
                return [
                    {
                        "title": r.get("name", "") or r.get("title", ""),
                        "snippet": r.get("summary", "") or r.get("snippet", ""),
                        "url": r.get("url", ""),
                    }
                    for r in (((data.get("data") or {}).get("webPages") or {}).get("value", []) or [])[:top_k]
                ]
        except httpx.TimeoutException:
            logger.warning("web_search 请求超时")
            return [{"error": "博查搜索请求超时，请稍后重试", "query": query}]
        except Exception as exc:
            logger.warning(f"web_search 失败: {exc}")
            return [{"error": "搜索失败", "query": query}]

    async def _get_cache(self, query_hash: str) -> list[dict] | None:
        """查询搜索缓存；超过 24h 的旧缓存视为过期（删除并返回 None）。

        Args:
            query_hash: 查询哈希。

        Returns:
            缓存结果列表，不存在或已过期返回 None。
        """
        stmt = select(WebSearchCache).where(WebSearchCache.query_hash == query_hash)
        result = await self.session.execute(stmt)
        cache = result.scalar_one_or_none()
        if cache:
            created = cache.created_at
            if created and (datetime.now() - created) > timedelta(hours=_CACHE_TTL_HOURS):
                logger.info(f"web_search 缓存过期，删除并重新搜索: {query_hash[:8]}")
                await self.session.execute(sqla_delete(WebSearchCache).where(WebSearchCache.id == cache.id))
                await self.session.commit()
                return None
            cache.hit_count += 1
            await self.session.commit()
            return cache.results
        return None

    async def _save_cache(self, query: str, query_hash: str, results: list[dict]):
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
