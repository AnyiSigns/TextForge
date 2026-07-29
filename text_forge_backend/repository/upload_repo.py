from typing import List
import hashlib
import os
import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile

from model.document import Document, Chunk
from core.model_factory import ModelFactory


async def compute_md5(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()


async def find_document_by_md5(session: AsyncSession, md5: str):
    stmt = (
        __import__("sqlalchemy")
        .select(Document)
        .where(Document.file_md5 == md5, Document.scope == "public")
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def create_document(session: AsyncSession, file: UploadFile, md5: str, content: bytes) -> Document:
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
    return doc


async def create_chunks(session: AsyncSession, doc_id: int, chunks: List[str], embedder) -> List[Chunk]:
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
    return records


async def process_upload(session: AsyncSession, file: UploadFile, emb_config: dict | None = None):
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
