from typing import Optional, List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.document import Document, Chunk


class DocumentRepository:
    """文档仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 DocumentRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def list_documents(self, user_id: int, scope: Optional[str] = None) -> List[Document]:
        """查询用户文档列表。

        Args:
            user_id: 用户 ID。
            scope: 文档范围，可选。

        Returns:
            文档实例列表。
        """
        stmt = select(Document).where(Document.user_id == user_id)
        if scope:
            stmt = stmt.where(Document.scope == scope)
        stmt = stmt.order_by(Document.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_document(self, doc_id: int, user_id: int) -> Optional[Document]:
        """查询单个文档，校验所有权。

        Args:
            doc_id: 文档 ID。
            user_id: 用户 ID。

        Returns:
            文档实例，不存在或无权限返回 None。
        """
        stmt = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_md5(self, md5: str, scope: str = "public") -> Optional[Document]:
        """根据 MD5 查询文档。

        Args:
            md5: 文件 MD5。
            scope: 文档范围。

        Returns:
            文档实例，不存在返回 None。
        """
        stmt = select(Document).where(Document.file_md5 == md5, Document.scope == scope)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_document(self, user_id: int, file_name: str, file_md5: str, file_type: Optional[str] = None, file_size: Optional[int] = None, scope: str = "personal", metadatas: Optional[dict] = None) -> Document:
        """创建文档记录。

        Args:
            user_id: 用户 ID。
            file_name: 文件名。
            file_md5: 文件 MD5。
            file_type: 文件类型。
            file_size: 文件大小。
            scope: 文档范围。
            metadatas: 元数据。

        Returns:
            新创建的文档实例。
        """
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
        """删除文档，校验所有权。

        Args:
            doc_id: 文档 ID。
            user_id: 用户 ID。

        Returns:
            删除成功返回 True，否则返回 False。
        """
        stmt = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        result = await self.session.execute(stmt)
        doc = result.scalar_one_or_none()
        if not doc:
            return False
        await self.session.delete(doc)
        await self.session.flush()
        return True

    async def list_chunks(self, doc_id: int, user_id: Optional[int] = None) -> List[Chunk]:
        """查询文档 Chunk 列表。

        Args:
            doc_id: 文档 ID。
            user_id: 用户 ID，可选，用于权限校验。

        Returns:
            Chunk 实例列表。
        """
        stmt = select(Chunk).where(Chunk.doc_id == doc_id).order_by(Chunk.chunk_index)
        if user_id is not None:
            stmt = stmt.join(Document).where(Document.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_chunks(self, doc_id: int, chunks: List[str], embeddings: Optional[List[List[float]]] = None) -> List[Chunk]:
        """批量创建文档 Chunk。

        Args:
            doc_id: 文档 ID。
            chunks: 文本块列表。
            embeddings: 向量列表，可选。

        Returns:
            新创建的 Chunk 实例列表。
        """
        records = []
        for idx, text in enumerate(chunks):
            embedding = embeddings[idx] if embeddings and idx < len(embeddings) else None
            records.append(Chunk(doc_id=doc_id, chunk_index=idx, content=text, embedding=embedding, metadatas={}))
        self.session.add_all(records)
        await self.session.flush()
        return records
