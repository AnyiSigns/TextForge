from typing import List, Dict, Any
from sqlalchemy import select, delete as sqla_delete
from sqlalchemy.ext.asyncio import AsyncSession
from repository.vector_repo import VectorRepository
from core.model_factory import ModelFactory
from utils.logger import get_logger
from model.document import Document, Chunk

logger = get_logger(__name__)


class KnowledgeService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def search_public(
        self, query: str, top_k: int = 3, model_config: dict | None = None
    ) -> List[dict]:
        if not query.strip():
            return []

        embedding = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"知识库检索 embedding 失败: {exc}")

        if embedding is None or not embedding:
            return []

        vector_repo = VectorRepository(self.session)
        items = await vector_repo.search_external_books(
            query_embedding=embedding,
            rag_filter={"query": query},
            top_k=top_k,
        )
        return items

    async def upload_public(self, file, emb_config: dict | None = None):
        from repository.upload_repo import process_upload

        return await process_upload(self.session, file, emb_config=emb_config)

    async def list_public(self, page: int = 1, page_size: int = 20):
        stmt = select(Document).where(Document.scope == "public").order_by(Document.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_public(self, doc_id: int):
        stmt = select(Document).where(Document.id == doc_id, Document.scope == "public")
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_public(self, doc_id: int):
        stmt = sqla_delete(Document).where(Document.id == doc_id, Document.scope == "public")
        await self.session.execute(stmt)
        await self.session.flush()