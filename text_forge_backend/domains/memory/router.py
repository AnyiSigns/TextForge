from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from shared.database import db_manager
from schema.request.memory import AgentMemoryRequest, AgentMemoryUpdateRequest, AgentMemorySearchRequest
from schema.response.memory import AgentMemoryResponse
from .service import AgentMemoryService

router = APIRouter(prefix="/agent-memories", tags=["Agent Memory"])


def agent_memory_db(session: AsyncSession = Depends(db_manager.get_db)) -> AgentMemoryService:
    return AgentMemoryService(session)


@router.get("/", response_model=List[AgentMemoryResponse])
async def list_memories(
    user_id=Depends(get_current),
    book_id: Optional[int] = Query(default=None),
    memory_type: Optional[str] = Query(default=None),
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


@router.post("/search", response_model=List[AgentMemoryResponse])
async def search_memories(
    user_id=Depends(get_current),
    body: AgentMemorySearchRequest = ...,
    service: AgentMemoryService = Depends(agent_memory_db),
):
    return await service.search_memories(
        user_id=user_id,
        mode=body.mode or "fulltext",
        query=body.q,
        book_id=body.book_id,
        memory_type=body.memory_type,
        top_k=body.top_k or 5,
        model_config=body.model_config_data,
    )
