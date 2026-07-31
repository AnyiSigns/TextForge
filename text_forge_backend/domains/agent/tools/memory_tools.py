from typing import Optional, List
from langchain_core.tools import tool
from domains.memory.service import AgentMemoryService
from shared.database import db_manager


@tool
async def save_memory(user_id: int, content: str, memory_type: str = "preference", book_id: Optional[int] = None, priority: int = 5, source: str = "agent_self_reflection", related_character_ids: Optional[list] = None, related_chapter_id: Optional[int] = None, meta: Optional[dict] = None) -> dict:
    """Save a memory entry for the user."""
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
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
async def recall_memory(user_id: int, query: str, memory_type: Optional[str] = None, book_id: Optional[int] = None, top_k: int = 5, model_config: Optional[dict] = None) -> List[dict]:
    """Search memories for the user."""
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        results = await service.search_memories(
            user_id=user_id,
            mode="semantic",
            query=query,
            book_id=book_id,
            memory_type=memory_type,
            top_k=top_k,
            model_config=model_config,
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
async def list_memories_by_type(user_id: int, memory_type: str, book_id: Optional[int] = None) -> List[dict]:
    """List memories filtered by type."""
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        return await service.list_memories(user_id=user_id, book_id=book_id, memory_type=memory_type)


@tool
async def forget_memory(user_id: int, memory_id: int) -> dict:
    """Delete a memory entry by ID."""
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        memory = await service.get_memory(user_id=user_id, memory_id=memory_id)
        if not memory:
            return {"ok": False, "detail": "记忆不存在"}
        await service.delete_memory(user_id=user_id, memory_id=memory_id)
        return {"ok": True}


@tool
async def update_memory(user_id: int, memory_id: int, content: Optional[str] = None, memory_type: Optional[str] = None, priority: Optional[int] = None, meta: Optional[dict] = None) -> dict:
    """Update a memory entry."""
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        payload = {k: v for k, v in {"memory_type": memory_type, "content": content, "priority": priority, "meta": meta}.items() if v is not None}
        memory = await service.update_memory(user_id=user_id, memory_id=memory_id, data=payload)
        if not memory:
            return {"ok": False, "detail": "记忆不存在"}
        return {"ok": True, "memory": memory}
