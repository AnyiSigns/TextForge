from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from .repository import AgentMemoryRepository
from core.model_factory import ModelFactory
from config.logging import get_logger

logger = get_logger(__name__)


class AgentMemoryService:
    def __init__(self, session: AsyncSession):
        self.repo = AgentMemoryRepository(session)

    async def save_memory(self, user_id: int, book_id: Optional[int], memory_type: str, content: str, related_chapter_id: Optional[int] = None, related_character_ids: Optional[list] = None, priority: int = 5, source: str = "agent_self_reflection", meta: Optional[dict] = None):
        if related_character_ids is None:
            related_character_ids = []
        payload = {
            "book_id": book_id,
            "memory_type": memory_type,
            "content": content,
            "related_chapter_id": related_chapter_id,
            "related_character_ids": related_character_ids,
            "priority": priority,
            "source": source,
            "meta": meta or {},
        }
        return await self.repo.create(user_id, payload)

    async def list_memories(self, user_id: int, book_id: Optional[int] = None, memory_type: Optional[str] = None) -> List[dict]:
        items = await self.repo.list_by_user(user_id=user_id, book_id=book_id, memory_type=memory_type)
        return [self._to_dict(m) for m in items]

    async def get_memory(self, user_id: int, memory_id: int):
        memory = await self.repo.get(memory_id)
        if not memory or memory.user_id != user_id:
            return None
        return self._to_dict(memory)

    async def update_memory(self, user_id: int, memory_id: int, data: dict):
        memory = await self.repo.get(memory_id)
        if not memory or memory.user_id != user_id:
            return None
        return await self.repo.update(memory_id, data)

    async def delete_memory(self, user_id: int, memory_id: int):
        memory = await self.repo.get(memory_id)
        if not memory or memory.user_id != user_id:
            return
        await self.repo.delete(memory_id)

    async def search_memories(self, user_id: int, mode: str, query: str, book_id: Optional[int] = None, memory_type: Optional[str] = None, top_k: int = 5, model_config: Optional[dict] = None):
        if mode == "fulltext":
            items = await self.repo.search_fulltext(user_id=user_id, query=query, book_id=book_id, memory_type=memory_type)
            return [self._to_dict(m) for m in items]
        if mode == "semantic":
            embedding = None
            if model_config:
                try:
                    llm = ModelFactory(model_config)
                    embedding = await llm.embedding.aembed_query(query)
                except Exception as exc:
                    logger.warning(f"记忆语义检索 embedding 失败: {exc}")
            if not embedding:
                return []
            rows = await self.repo.search_semantic(user_id=user_id, query_embedding=embedding, book_id=book_id, memory_type=memory_type, top_k=top_k)
            result = []
            for row in rows:
                memory = row["memory"]
                distance = row["distance"]
                payload = self._to_dict(memory)
                payload["distance"] = float(distance) if distance is not None else None
                result.append(payload)
            return result
        return []

    def _to_dict(self, memory) -> dict:
        return {
            "id": memory.id,
            "user_id": memory.user_id,
            "book_id": memory.book_id,
            "memory_type": memory.memory_type,
            "content": memory.content,
            "related_chapter_id": memory.related_chapter_id,
            "related_character_ids": memory.related_character_ids or [],
            "priority": memory.priority,
            "source": memory.source,
            "meta": memory.meta or {},
            "created_at": memory.created_at.isoformat() if memory.created_at else None,
            "updated_at": memory.updated_at.isoformat() if memory.updated_at else None,
        }
