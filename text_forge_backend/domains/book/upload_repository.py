import hashlib
import os
import uuid

import sqlalchemy
from core.model_factory import ModelFactory
from fastapi import UploadFile
from langchain_text_splitters import RecursiveCharacterTextSplitter
from models.document import Chunk, Document
from sqlalchemy.ext.asyncio import AsyncSession


async def compute_md5(content: bytes) -> str:
    """计算字节内容的 MD5。

    Args:
        content: 原始字节内容。

    Returns:
        MD5 十六进制字符串。
    """
    return hashlib.md5(content).hexdigest()


async def find_document_by_md5(session: AsyncSession, md5: str):
    """根据 MD5 查询公共文档。

    Args:
        session: SQLAlchemy 异步会话。
        md5: 文件 MD5。

    Returns:
        Document 实例，不存在返回 None。
    """
    stmt = (
        sqlalchemy
        .select(Document)
        .where(Document.file_md5 == md5, Document.scope == "public")
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def create_document(session: AsyncSession, file: UploadFile, md5: str, content: bytes) -> Document:
    """创建文档记录。

    Args:
        session: SQLAlchemy 异步会话。
        file: 上传文件。
        md5: 文件 MD5。
        content: 文件内容。

    Returns:
        新创建的 Document 实例。
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    doc = Document(
        file_name=file.filename or f"upload_{uuid.uuid4().hex[:8]}{ext}",
        author="",
        file_type=(ext.lstrip(".") if ext else None),
        file_md5=md5,
        user_id=0,
        file_size=len(content),
        scope="public",
        metadatas={},
    )
    session.add(doc)
    await session.flush()
    await session.refresh(doc)
    return doc


async def create_chunks(session: AsyncSession, doc_id: int, chunks: list[str], embedder) -> list[Chunk]:
    """批量创建 Chunk 并生成 embedding。

    Args:
        session: SQLAlchemy 异步会话。
        doc_id: 文档 ID。
        chunks: 文本块列表。
        embedder: embedding 模型实例。

    Returns:
        新创建的 Chunk 实例列表。
    """
    records = []
    for idx, text in enumerate(chunks):
        embedding = None
        try:
            embedding = await embedder.aembed_query(text)
        except Exception:
            embedding = None
        records.append(
            Chunk(
                doc_id=doc_id,
                chunk_index=idx,
                content=text,
                embedding=embedding,
                metadatas={},
            )
        )
    session.add_all(records)
    await session.flush()
    return records


async def process_upload(session: AsyncSession, file: UploadFile, emb_config: dict | None = None):
    """处理文档上传全流程。

    Args:
        session: SQLAlchemy 异步会话。
        file: 上传文件。
        emb_config: embedding 配置。

    Returns:
        上传结果字典，包含 document_id、file_name、status、chunks。
    """
    content = await file.read()
    if not content:
        raise ValueError("文件内容为空")

    md5 = await compute_md5(content)

    try:
        text = content.decode("utf-8", errors="ignore")
    except Exception:
        raise ValueError("暂不支持该文件编码")

    existing = await find_document_by_md5(session, md5)
    if existing:
        return {
            "document_id": existing.id,
            "file_name": existing.file_name,
            "status": "existed",
            "chunks": len(existing.chunks),
        }

    doc = await create_document(session, file, md5, content)

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    splitted = splitter.split_text(text)

    embedder = ModelFactory({"embedding_config": emb_config or {}}).embedding

    await create_chunks(session, doc.id, splitted, embedder)

    return {
        "document_id": doc.id,
        "file_name": doc.file_name,
        "status": "uploaded",
        "chunks": len(splitted),
    }
