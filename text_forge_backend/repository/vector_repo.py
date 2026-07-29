from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from model.document import Document, Chunk
from infrastructure.redis import cached_rag_search, set_rag_cache
from utils.logger import get_logger

logger = get_logger(__name__)


class VectorRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def search_external_books(
        self,
        query_embedding: List[float],
        rag_filter: Dict[str, Any],
        top_k: int = 3,
        use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
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
