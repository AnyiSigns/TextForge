from typing import Optional, List
from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession
from domains.agent.service import WebSearchService
from config.logging import get_logger

logger = get_logger(__name__)


def build_web_search_tool(session_factory, model_config: Optional[dict] = None):
    @tool
    async def web_search(query: str, top_k: int = 5) -> List[dict]:
        session = await session_factory()
        api_key = ""
        if model_config:
            api_key = ((model_config or {}).get("search_config") or {}).get(
                "api_key"
            ) or ""
        if not api_key:
            return [{"error": "未配置 search_config.api_key", "query": query}]
        service = WebSearchService(session)
        return await service.search(
            query=query, api_key=api_key, top_k=top_k, use_cache=True
        )

    return web_search
