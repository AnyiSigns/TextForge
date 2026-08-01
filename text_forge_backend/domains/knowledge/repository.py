from typing import Any

from config.logging import get_logger
from models.document import Chunk, Document
from shared.redis import cached_rag_search, set_rag_cache
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


class VectorRepository:
    """向量检索仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 VectorRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def search_external_books(
        self,
        query_embedding: list[float],
        rag_filter: dict[str, Any],
        top_k: int = 3,
        use_cache: bool = True,
    ) -> list[dict[str, Any]]:
        """向量检索公开知识库。

        Args:
            query_embedding: 查询向量。
            rag_filter: 过滤条件，支持 doc_ids、author_ids、sample、query。
            top_k: 返回结果数。
            use_cache: 是否使用 Redis 缓存。

        Returns:
            检索结果列表，每个元素包含 doc_id、doc_title、doc_author、content、distance。
        """
        query_text = rag_filter.get("query", "")
        cache_hit = None
        if use_cache and query_text:
            cache_hit = await cached_rag_search(
                query=query_text,
                query_embedding=query_embedding,
                rag_filter=rag_filter,
                top_k=top_k,
            )
            if cache_hit is not None:
                return cache_hit

        stmt = (
            select(
                Chunk,
                Document.file_name.label("doc_title"),
                Document.author.label("doc_author"),
                Chunk.content.label("content"),
                Chunk.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .join(Document, Chunk.doc_id == Document.id)
            .where(Document.scope == "public")
        )

        if rag_filter.get("doc_ids"):
            stmt = stmt.where(
                Document.id.in_(
                    [int(d) for d in rag_filter["doc_ids"] if str(d).isdigit()]
                )
            )
        if rag_filter.get("author_ids"):
            stmt = stmt.where(Document.author.in_(rag_filter["author_ids"]))
        if rag_filter.get("sample"):
            stmt = stmt.where(Document.file_name.ilike(f"%{rag_filter['sample']}%"))

        stmt = stmt.order_by(Chunk.embedding.cosine_distance(query_embedding)).limit(
            top_k
        )
        result = await self.session.execute(stmt)
        rows = result.all()
        items = []
        for row in rows:
            items.append(
                {
                    "doc_id": row.Chunk.doc_id,
                    "doc_title": row.doc_title,
                    "doc_author": row.doc_author,
                    "content": row.content,
                    "distance": (
                        float(row.distance) if row.distance is not None else 0.0
                    ),
                }
            )

        if use_cache and query_text and items:
            try:
                await set_rag_cache(
                    query=query_text,
                    rag_filter=rag_filter,
                    results=items,
                )
            except Exception as exc:
                logger.warning(f"vector_repo 缓存写入失败: {exc}")

        return items
