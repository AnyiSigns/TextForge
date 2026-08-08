
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.model_factory import ModelFactory
from shared.pagination import PageParams, PageResult

from .repository import AgentMemoryRepository

logger = get_logger(__name__)


class AgentMemoryService:
    def __init__(self, session: AsyncSession):
        self.repo = AgentMemoryRepository(session)

    async def save_memory(self, user_id: int, book_id: int | None, memory_type: str, content: str, related_chapter_id: int | None = None, related_character_ids: list | None = None, priority: int = 5, source: str = "agent_self_reflection", meta: dict | None = None, model_config: dict | None = None):
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
        # 保存时同步生成向量嵌入：语义检索依赖非 NULL 的 embedding，
        # 否则刚保存的记忆永远查不到（此前 save 路径从不写 embedding）。
        # 计算失败（无嵌入模型/网络异常）时静默降级为全文检索。
        if model_config and content:
            try:
                llm = ModelFactory(model_config)
                payload["embedding"] = await llm.embedding.aembed_query(content[:2000])
            except Exception as exc:
                logger.warning(f"记忆 embedding 生成失败，降级全文检索: {exc}")
        return await self.repo.create(user_id, payload)

    async def list_memories(self, user_id: int, book_id: int | None = None, memory_type: str | None = None) -> list[dict]:
        items = await self.repo.list_by_user(user_id=user_id, book_id=book_id, memory_type=memory_type)
        return [self._to_dict(m) for m in items]

    async def list_memories_page(self, user_id: int, book_id: int | None, memory_type: str | None, page_params: PageParams) -> PageResult:
        items, total = await self.repo.list_by_user_page(user_id=user_id, book_id=book_id, memory_type=memory_type, offset=page_params.offset, limit=page_params.limit)
        return PageResult(
            items=[self._to_dict(m) for m in items],
            total=total,
            page=page_params.page,
            page_size=page_params.page_size,
        )

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

    async def search_memories(self, user_id: int, mode: str, query: str, book_id: int | None = None, memory_type: str | None = None, top_k: int = 5, model_config: dict | None = None):
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
