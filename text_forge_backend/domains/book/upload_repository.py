import hashlib
import os
import uuid

import sqlalchemy
from fastapi import UploadFile
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.ext.asyncio import AsyncSession

from core.model_factory import ModelFactory
from models.document import Chunk, Document


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


async def create_document(
    session: AsyncSession, file: UploadFile, md5: str, content: bytes, user_id: int
) -> Document:
    """创建文档记录。

    Args:
        session: SQLAlchemy 异步会话。
        file: 上传文件。
        md5: 文件 MD5。
        content: 文件内容。
        user_id: 上传者用户 ID，写入 Document.user_id 以满足外键约束。

    Returns:
        新创建的 Document 实例。
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    doc = Document(
        file_name=file.filename or f"upload_{uuid.uuid4().hex[:8]}{ext}",
        author="",
        file_type=(ext.lstrip(".") if ext else None),
        file_md5=md5,
        user_id=user_id,
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
        # 空向量（embedding 配置缺失走 _EmbeddingStub 返回 [] 或异常）落 NULL，
        # 避免将空列表写进 pgvector 触发维度校验报错；后续检索会回退 fulltext。
        if not embedding:
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


# 公共知识库文档上传限制：与 knowledge 域路由的常量保持一致
UPLOAD_MAX_BYTES = 10 * 1024 * 1024
UPLOAD_ALLOWED_EXT = ("txt", "md", "markdown", "json", "csv")


async def process_upload(
    session: AsyncSession, file: UploadFile, user_id: int, emb_config: dict | None = None
):
    """处理文档上传全流程。

    先校验体积与扩展名（拒绝超大/二进制文件），再读取解析。

    Args:
        session: SQLAlchemy 异步会话。
        file: 上传文件。
        user_id: 上传者用户 ID，透传至 Document.user_id。
        emb_config: embedding 配置。

    Returns:
        上传结果字典，包含 document_id、file_name、status、chunks。

    Raises:
        ValueError: 文件为空、超限、类型不支持或编码不支持时抛出。
    """
    # 体积探测：先 seek 到末尾读大小，避免把超大文件整个读进内存
    try:
        await file.seek(0, 2)
        size = await file.tell()
        await file.seek(0)
    except Exception:
        size = None
    if size is not None and size > UPLOAD_MAX_BYTES:
        raise ValueError(f"文件体积过大，最大支持 {UPLOAD_MAX_BYTES // (1024 * 1024)}MB")

    ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".")
    if ext not in UPLOAD_ALLOWED_EXT:
        raise ValueError("仅支持 TXT / Markdown / JSON / CSV 文档")

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

    doc = await create_document(session, file, md5, content, user_id)

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
