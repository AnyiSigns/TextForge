from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query, File, UploadFile, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from shared.database import db_manager
from schema.request.knowledge import KnowledgeSearchRequest
from schema.response.knowledge import KnowledgeSearchResponse, KnowledgeChunk
from .service import KnowledgeService

router = APIRouter(prefix="/knowledge", tags=["知识库"])


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_public_knowledge(
    user_id: Annotated[int, Depends(get_current)],
    body: KnowledgeSearchRequest,
    session: AsyncSession = Depends(db_manager.get_db),
):
    if body.scope != "public":
        raise HTTPException(status_code=400, detail="仅支持公开知识库搜索")

    model_config = body.model_config_data
    service = KnowledgeService(session)
    items = await service.search_public(query=body.query, top_k=body.top_k or 3, model_config=model_config)

    chunks = [
        KnowledgeChunk(
            doc_id=int(item.get("doc_id", 0) or 0),
            doc_name=item.get("doc_title", "") or "",
            text=item.get("content", "") or "",
            score=float(item.get("distance", 0) or 0),
            uploader_name=item.get("doc_author"),
        )
        for item in items
    ]
    return KnowledgeSearchResponse(chunks=chunks)


@router.post("/upload")
async def upload_public_document(
    user_id: Annotated[int, Depends(get_current)],
    file: UploadFile = File(...),
    model_config_json: Annotated[Optional[str], Form()] = None,
    session: AsyncSession = Depends(db_manager.get_db),
):
    import json
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in ("txt", "md", "markdown", "json", "csv"):
        raise HTTPException(status_code=400, detail="暂不支持该文件类型")

    model_config = json.loads(model_config_json) if model_config_json else None
    service = KnowledgeService(session)
    result = await service.upload_public(file, emb_config=model_config.get("embedding_config") if model_config else None)
    return result


@router.get("/")
async def list_public_documents(
    user_id: Annotated[int, Depends(get_current)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(db_manager.get_db),
):
    service = KnowledgeService(session)
    items = await service.list_public(page=page, page_size=page_size)
    return [
        {
            "id": item.id,
            "file_name": item.file_name,
            "file_type": item.file_type,
            "file_size": item.file_size,
            "scope": item.scope,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@router.get("/{doc_id}")
async def get_public_document(
    user_id: Annotated[int, Depends(get_current)],
    doc_id: int,
    session: AsyncSession = Depends(db_manager.get_db),
):
    service = KnowledgeService(session)
    doc = await service.get_public(doc_id)
    if not doc or doc.scope != "public":
        raise HTTPException(status_code=404, detail="文档不存在")
    return {
        "id": doc.id,
        "file_name": doc.file_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "scope": doc.scope,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


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
    await service.delete_public(doc_id)
    return {"ok": True}
