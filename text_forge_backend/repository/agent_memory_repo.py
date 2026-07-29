from typing import List, Optional
from sqlalchemy import select, delete as sqla_delete, or_, func
from sqlalchemy.orm import Mapped
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import literal_column

from model.agent_memory import AgentMemory


class AgentMemoryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: int, data: dict) -> AgentMemory:
        memory = AgentMemory(user_id=user_id, **data)
        self.session.add(memory)
        await self.session.flush()
        return memory

    async def get(self, memory_id: int):
        stmt = select(AgentMemory).where(AgentMemory.id == memory_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int, book_id: Optional[int] = None, memory_type: Optional[str] = None) -> List[AgentMemory]:
        stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if book_id is not None:
            stmt = stmt.where(AgentMemory.book_id == book_id)
        else:
            stmt = stmt.where(AgentMemory.book_id.is_(None))
        if memory_type:
            stmt = stmt.where(AgentMemory.memory_type == memory_type)
        stmt = stmt.order_by(AgentMemory.priority.desc(), AgentMemory.updated_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update(self, memory_id: int, data: dict) -> Optional[AgentMemory]:
        stmt = select(AgentMemory).where(AgentMemory.id == memory_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in data.items():
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
        return instance

    async def delete(self, memory_id: int):
        stmt = sqla_delete(AgentMemory).where(AgentMemory.id == memory_id)
        await self.session.execute(stmt)
        await self.session.flush()

    async def search_fulltext(self, user_id: int, query: str, book_id: Optional[int] = None, memory_type: Optional[str] = None) -> List[AgentMemory]:
        stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if book_id is not None:
            stmt = stmt.where(AgentMemory.book_id == book_id)
        else:
            stmt = stmt.where(AgentMemory.book_id.is_(None))
        if memory_type:
            stmt = stmt.where(AgentMemory.memory_type == memory_type)
        if query:
            stmt = stmt.where(AgentMemory.content.ilike(f"%{query}%"))
        stmt = stmt.order_by(AgentMemory.priority.desc(), AgentMemory.updated_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def search_semantic(self, user_id: int, query_embedding: List[float], book_id: Optional[int] = None, memory_type: Optional[str] = None, top_k: int = 5):
        from pgvector.sqlalchemy import Vector
        stmt = select(AgentMemory, AgentMemory.embedding.cosine_distance(query_embedding).label("distance"))
        stmt = stmt.where(AgentMemory.user_id == user_id)
        if book_id is not None:
            stmt = stmt.where(AgentMemory.book_id == book_id)
        else:
            stmt = stmt.where(AgentMemory.book_id.is_(None))
        if memory_type:
            stmt = stmt.where(AgentMemory.memory_type == memory_type)
        stmt = stmt.order_by(literal_column("distance")).limit(top_k)
        result = await self.session.execute(stmt)
        rows = result.all()
        return [
            {
                "memory": row[0],
                "distance": row[1],
            }
            for row in rows
        ]
