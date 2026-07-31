from typing import Optional, List
from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession
from .agent_memory_service import AgentMemoryService
from core.model_factory import ModelFactory


async def _get_service_from_context(session: AsyncSession) -> AgentMemoryService:
    return AgentMemoryService(session)


@tool
async def save_memory(session: AsyncSession, user_id: int, content: str, memory_type: str = "preference", book_id: Optional[int] = None, priority: int = 5, source: str = "agent_self_reflection", related_character_ids: Optional[list] = None, related_chapter_id: Optional[int] = None, meta: Optional[dict] = None) -> dict:
    """Save a memory entry for the user."""
    service = await _get_service_from_context(session)
    memory = await service.save_memory(
        user_id=user_id,
        book_id=book_id,
        memory_type=memory_type,
        content=content,
        related_chapter_id=related_chapter_id,
        related_character_ids=related_character_ids,
        priority=priority,
        source=source,
        meta=meta,
    )
    return {"memory_id": memory.id}


@tool
async def recall_memory(session: AsyncSession, user_id: int, query: str, memory_type: Optional[str] = None, book_id: Optional[int] = None, top_k: int = 5, model_conf: Optional[dict] = None) -> List[dict]:
    """Search memories for the user."""
    service = await _get_service_from_context(session)
    results = await service.search_memories(
        user_id=user_id,
        mode="semantic",
        query=query,
        book_id=book_id,
        memory_type=memory_type,
        top_k=top_k,
        model_config=model_conf,
    )
    if not results:
        results = await service.search_memories(
            user_id=user_id,
            mode="fulltext",
            query=query,
            book_id=book_id,
            memory_type=memory_type,
            top_k=top_k,
            model_config=None,
        )
    return results


@tool
async def list_memories_by_type(session: AsyncSession, user_id: int, memory_type: str, book_id: Optional[int] = None) -> List[dict]:
    """List memories filtered by type."""
    service = await _get_service_from_context(session)
    return await service.list_memories(user_id=user_id, book_id=book_id, memory_type=memory_type)


@tool
async def forget_memory(session: AsyncSession, user_id: int, memory_id: int) -> dict:
    """Delete a memory entry by ID."""
    service = await _get_service_from_context(session)
    memory = await service.get_memory(user_id=user_id, memory_id=memory_id)
    if not memory:
        return {"ok": False, "detail": "记忆不存在"}
    await service.delete_memory(user_id=user_id, memory_id=memory_id)
    return {"ok": True}


@tool
async def update_memory(session: AsyncSession, user_id: int, memory_id: int, content: Optional[str] = None, memory_type: Optional[str] = None, priority: Optional[int] = None, meta: Optional[dict] = None) -> dict:
    """Update a memory entry."""
    service = await _get_service_from_context(session)
    payload = {k: v for k, v in {"memory_type": memory_type, "content": content, "priority": priority, "meta": meta}.items() if v is not None}
    memory = await service.update_memory(user_id=user_id, memory_id=memory_id, data=payload)
    if not memory:
        return {"ok": False, "detail": "记忆不存在"}
    return {"ok": True, "memory": memory}
