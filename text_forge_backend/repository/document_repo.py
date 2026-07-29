from typing import Optional, List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from model.document import Document, Chunk


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_documents(self, user_id: int, scope: Optional[str] = None) -> List[Document]:
        stmt = select(Document).where(Document.user_id == user_id)
        if scope:
            stmt = stmt.where(Document.scope == scope)
        stmt = stmt.order_by(Document.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_document(self, doc_id: int, user_id: int) -> Optional[Document]:
        stmt = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_md5(self, md5: str, scope: str = "public") -> Optional[Document]:
        stmt = select(Document).where(Document.file_md5 == md5, Document.scope == scope)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_document(self, user_id: int, file_name: str, file_md5: str, file_type: Optional[str] = None, file_size: Optional[int] = None, scope: str = "personal", metadatas: Optional[dict] = None) -> Document:
        doc = Document(
            user_id=user_id,
            file_name=file_name,
            file_md5=file_md5,
            file_type=file_type,
            file_size=file_size,
            scope=scope,
            metadatas=metadatas or {},
        )
        self.session.add(doc)
        await self.session.flush()
        await self.session.refresh(doc)
        return doc

    async def delete_document(self, doc_id: int, user_id: int) -> bool:
        stmt = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        result = await self.session.execute(stmt)
        doc = result.scalar_one_or_none()
        if not doc:
            return False
        await self.session.delete(doc)
        await self.session.flush()
        return True

    async def list_chunks(self, doc_id: int, user_id: Optional[int] = None) -> List[Chunk]:
        stmt = select(Chunk).where(Chunk.doc_id == doc_id).order_by(Chunk.chunk_index)
        if user_id is not None:
            stmt = stmt.join(Document).where(Document.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_chunks(self, doc_id: int, chunks: List[str], embeddings: Optional[List[List[float]]] = None) -> List[Chunk]:
        records = []
        for idx, text in enumerate(chunks):
            embedding = embeddings[idx] if embeddings and idx < len(embeddings) else None
            records.append(Chunk(doc_id=doc_id, chunk_index=idx, content=text, embedding=embedding, metadatas={}))
        self.session.add_all(records)
        await self.session.flush()
        return records
