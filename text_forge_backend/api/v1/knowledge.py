from typing import Annotated, List
from fastapi import APIRouter, Depends, Query, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from infrastructure.database import db_manager
from schema.request.knowledge import KnowledgeSearchRequest
from schema.response.knowledge import KnowledgeSearchResponse, KnowledgeChunk
from service.knowledge_service import KnowledgeService
from repository.model_repo import ModelConfRepository
from model.document import Document, Chunk

router = APIRouter(prefix="/knowledge", tags=["知识库"])


async def _get_model_config(user_id: int, session: AsyncSession) -> dict:
    try:
        repo = ModelConfRepository(session)
        instance = await repo.query_user_model(user_id)
        if instance:
            return {
                "user_id": instance.user_id,
                "main_config": instance.main_config or {},
                "audit_config": instance.audit_config or {},
                "router_config": instance.router_config or {},
                "tool_config": instance.tool_config or {},
                "vision_config": instance.vision_config or {},
                "embedding_config": instance.embedding_config or {},
            }
    except Exception:
        pass
    return {}


@router.get("/search", response_model=KnowledgeSearchResponse)
async def search_public_knowledge(
    user_id: Annotated[int, Depends(get_current)],
    q: str = Query(..., description="检索关键词"),
    scope: str = Query("public", description="检索范围，目前仅支持 public"),
    top_k: int = Query(3, ge=1, le=20, description="返回条数"),
    session: AsyncSession = Depends(db_manager.get_db),
):
    if scope != "public":
        return KnowledgeSearchResponse(chunks=[])

    model_config = await _get_model_config(user_id, session)
    service = KnowledgeService(session)
    items = await service.search_public(query=q, top_k=top_k, model_config=model_config)

    chunks = [
        KnowledgeChunk(
            doc_id=str(item.get("doc_id", "")),
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
    session: AsyncSession = Depends(db_manager.get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in ("txt", "md", "markdown", "json", "csv"):
        raise HTTPException(status_code=400, detail="暂不支持该文件类型")

    model_config = await _get_model_config(user_id, session)
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
