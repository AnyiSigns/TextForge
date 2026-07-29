from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from infrastructure.database import db_manager
from schema.request.memory import AgentMemoryRequest, AgentMemoryUpdateRequest
from schema.response.memory import AgentMemoryResponse
from service.agent_memory_service import AgentMemoryService
from repository.model_repo import ModelConfRepository

router = APIRouter(prefix="/agent-memories", tags=["Agent Memory"])


def agent_memory_db(session: AsyncSession = Depends(db_manager.get_db)) -> AgentMemoryService:
    return AgentMemoryService(session)


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


@router.get("/", response_model=List[AgentMemoryResponse])
async def list_memories(
    user_id=Depends(get_current),
    book_id: Optional[int] = Query(None),
    memory_type: Optional[str] = Query(None),
    service: AgentMemoryService = Depends(agent_memory_db),
):
    return await service.list_memories(user_id=user_id, book_id=book_id, memory_type=memory_type)


@router.post("/", response_model=AgentMemoryResponse)
async def create_memory(
    user_id=Depends(get_current),
    request: AgentMemoryRequest = ...,
    service: AgentMemoryService = Depends(agent_memory_db),
):
    memory = await service.save_memory(
        user_id=user_id,
        book_id=request.book_id,
        memory_type=request.memory_type,
        content=request.content,
        related_chapter_id=request.related_chapter_id,
        related_character_ids=request.related_character_ids,
        priority=request.priority,
        source=request.source,
        meta=request.meta,
    )
    return AgentMemoryResponse(**service._to_dict(memory))


@router.put("/{memory_id}", response_model=AgentMemoryResponse)
async def update_memory(
    user_id=Depends(get_current),
    memory_id: int = ...,
    request: AgentMemoryUpdateRequest = ...,
    service: AgentMemoryService = Depends(agent_memory_db),
):
    payload = request.model_dump(exclude_unset=True, by_alias=False)
    memory = await service.update_memory(user_id=user_id, memory_id=memory_id, data=payload)
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")
    return AgentMemoryResponse(**memory)


@router.delete("/{memory_id}")
async def delete_memory(
    user_id=Depends(get_current),
    memory_id: int = ...,
    service: AgentMemoryService = Depends(agent_memory_db),
):
    await service.delete_memory(user_id=user_id, memory_id=memory_id)
    return {"ok": True}


@router.get("/search", response_model=List[AgentMemoryResponse])
async def search_memories(
    user_id=Depends(get_current),
    q: str = Query(...),
    mode: str = Query("fulltext"),
    book_id: Optional[int] = Query(None),
    memory_type: Optional[str] = Query(None),
    top_k: int = Query(5, ge=1, le=20),
    session: AsyncSession = Depends(db_manager.get_db),
    service: AgentMemoryService = Depends(agent_memory_db),
):
    model_config = await _get_model_config(user_id, session)
    return await service.search_memories(user_id=user_id, mode=mode, query=q, book_id=book_id, memory_type=memory_type, top_k=top_k, model_config=model_config)
