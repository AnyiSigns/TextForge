
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from schema.request.memory import (
    AgentMemoryRequest,
    AgentMemorySearchRequest,
    AgentMemoryUpdateRequest,
)
from schema.response.memory import AgentMemoryResponse
from shared.database import db_manager
from shared.pagination import PageParams, PageResult

from .service import AgentMemoryService

router = APIRouter(prefix="/agent-memories", tags=["Agent Memory"])


def agent_memory_db(session: AsyncSession = Depends(db_manager.get_db)) -> AgentMemoryService:
    return AgentMemoryService(session)


@router.get("/", response_model=PageResult[AgentMemoryResponse])
async def list_memories(
    user_id=Depends(get_current),
    book_id: int | None = Query(default=None),
    memory_type: str | None = Query(default=None),
    page_params: PageParams = Depends(),
    service: AgentMemoryService = Depends(agent_memory_db),
):
    return await service.list_memories_page(user_id=user_id, book_id=book_id, memory_type=memory_type, page_params=page_params)


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
    return AgentMemoryResponse(**service._to_dict(memory))


@router.delete("/{memory_id}")
async def delete_memory(
    user_id=Depends(get_current),
    memory_id: int = ...,
    service: AgentMemoryService = Depends(agent_memory_db),
):
    await service.delete_memory(user_id=user_id, memory_id=memory_id)
    return {"ok": True}


@router.post("/search", response_model=list[AgentMemoryResponse])
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
