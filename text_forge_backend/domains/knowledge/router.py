from typing import Annotated

import json
from json import JSONDecodeError

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.auth import get_current
from core.errors import classify_upload_error
from domains.book.upload_repository import UPLOAD_ALLOWED_EXT, UPLOAD_MAX_BYTES
from models.document import Chunk
from shared.database import db_manager
from shared.utils import redact_sensitive

from .service import KnowledgeService

logger = get_logger(__name__)

router = APIRouter(prefix="/knowledge", tags=["知识库"])


@router.post("/upload")
async def upload_public_document(
    user_id: Annotated[int, Depends(get_current)],
    file: UploadFile = File(...),
    model_config_json: Annotated[str | None, Form()] = None,
    session: AsyncSession = Depends(db_manager.get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in UPLOAD_ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail="暂不支持该文件类型，仅支持 TXT / Markdown / JSON / CSV。",
        )

    # 体积校验：上传前先探一下文件大小，避免读到内存才报错
    try:
        await file.seek(0, 2)
        size = await file.tell()
        await file.seek(0)
    except Exception:
        size = None
    if size is not None and size > UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="文件体积过大，请压缩或拆分后上传（上限 10MB）。",
        )

    # 模型配置 JSON 解析失败 → 400 而非 500（A18）
    model_config = None
    if model_config_json:
        try:
            model_config = json.loads(model_config_json)
        except JSONDecodeError:
            raise HTTPException(status_code=400, detail="模型配置格式错误")

    service = KnowledgeService(session)
    try:
        result = await service.upload_public(
            file,
            user_id=user_id,
            emb_config=model_config.get("embedding_config") if model_config else None,
        )
    except Exception as exc:
        # 文件解析/编码等可控异常 → 具体友好提示；其余归为内部错误不泄露
        if isinstance(exc, ValueError):
            raise classify_upload_error(exc)
        logger.error(f"知识库文档上传失败: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="文档上传失败，请稍后重试。")
    logger.info(
        "公共知识库文档上传请求完成 user_id=%s file=%s status=%s doc_id=%s",
        user_id,
        file.filename,
        result.get("status"),
        result.get("document_id"),
    )
    return result


@router.get("/public")
async def list_public_documents_summary(
    user_id: Annotated[int, Depends(get_current)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(db_manager.get_db),
):
    service = KnowledgeService(session)
    items = await service.list_public(page=page, page_size=page_size)
    return {"documents": [
        {
            "id": str(item.id),
            "name": item.file_name,
            "file_type": item.file_type,
            "file_size": item.file_size,
            "scope": item.scope,
            "createdAt": item.created_at.isoformat() if item.created_at else None,
            # author 为 NULL（历史存量上传）时返回 null，前端据此显示"暂无作者数据"
            "uploaderName": item.author,
            # 上传者 user_id，供前端判断是否本人以决定删除按钮可见性（B6）
            "uploaderId": item.user_id,
        }
        for item in items
    ]}


@router.get("/public/{doc_id}")
async def get_public_document_content(
    user_id: Annotated[int, Depends(get_current)],
    doc_id: int,
    session: AsyncSession = Depends(db_manager.get_db),
):
    service = KnowledgeService(session)
    doc = await service.get_public(doc_id)
    if not doc or doc.scope != "public":
        raise HTTPException(status_code=404, detail="文档不存在")
    # 预览内容按 chunk_index 拼接 chunks.content 返回（B5）：
    # metadatas 从不写 content，旧逻辑恒返回空；10MB 上限内接受返回全文。
    stmt = (
        select(Chunk.content)
        .where(Chunk.doc_id == doc_id)
        .order_by(Chunk.chunk_index)
    )
    result = await session.execute(stmt)
    contents = result.scalars().all()
    return {"content": "\n".join(contents)}


@router.delete("/{doc_id}")
async def delete_public_document(
    user_id: Annotated[int, Depends(get_current)],
    doc_id: int,
    session: AsyncSession = Depends(db_manager.get_db),
):
    service = KnowledgeService(session)
    doc = await service.get_public(doc_id)
    if not doc or doc.scope != "public":
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权删除该文档")
    await service.delete_public(doc_id)
    logger.info("公共知识库文档删除成功 user_id=%s doc_id=%s", user_id, doc_id)
    return {"ok": True}
