
from models.agent_memory import AgentMemory
from sqlalchemy import delete as sqla_delete
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession


class AgentMemoryRepository:
    """Agent 记忆仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 AgentMemoryRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def create(self, user_id: int, data: dict) -> AgentMemory:
        """创建 Agent 记忆。

        Args:
            user_id: 用户 ID。
            data: 记忆字段字典。

        Returns:
            新创建的 AgentMemory 实例。
        """
        memory = AgentMemory(user_id=user_id, **data)
        self.session.add(memory)
        await self.session.flush()
        await self.session.refresh(memory)
        return memory

    async def get(self, memory_id: int):
        """根据主键查询记忆。

        Args:
            memory_id: 记忆 ID。

        Returns:
            AgentMemory 实例，不存在返回 None。
        """
        stmt = select(AgentMemory).where(AgentMemory.id == memory_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int, book_id: int | None = None, memory_type: str | None = None) -> list[AgentMemory]:
        """查询用户记忆列表。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID，可选。
            memory_type: 记忆类型，可选。

        Returns:
            AgentMemory 实例列表。
        """
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

    async def list_by_user_page(self, user_id: int, book_id: int | None = None, memory_type: str | None = None, offset: int = 0, limit: int = 10) -> tuple[list[AgentMemory], int]:
        stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)
        count_stmt = select(func.count()).select_from(AgentMemory).where(AgentMemory.user_id == user_id)
        if book_id is not None:
            stmt = stmt.where(AgentMemory.book_id == book_id)
            count_stmt = count_stmt.where(AgentMemory.book_id == book_id)
        else:
            stmt = stmt.where(AgentMemory.book_id.is_(None))
            count_stmt = count_stmt.where(AgentMemory.book_id.is_(None))
        if memory_type:
            stmt = stmt.where(AgentMemory.memory_type == memory_type)
            count_stmt = count_stmt.where(AgentMemory.memory_type == memory_type)
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.order_by(AgentMemory.priority.desc(), AgentMemory.updated_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def update(self, memory_id: int, data: dict) -> AgentMemory | None:
        """更新记忆。

        Args:
            memory_id: 记忆 ID。
            data: 更新字段字典。

        Returns:
            更新后的 AgentMemory 实例，不存在返回 None。
        """
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
        """删除记忆。

        Args:
            memory_id: 记忆 ID。
        """
        stmt = sqla_delete(AgentMemory).where(AgentMemory.id == memory_id)
        await self.session.execute(stmt)
        await self.session.flush()

    async def search_fulltext(self, user_id: int, query: str, book_id: int | None = None, memory_type: str | None = None) -> list[AgentMemory]:
        """全文检索记忆。

        Args:
            user_id: 用户 ID。
            query: 查询关键词。
            book_id: 书籍 ID，可选。
            memory_type: 记忆类型，可选。

        Returns:
            匹配的 AgentMemory 实例列表。
        """
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

    async def search_semantic(self, user_id: int, query_embedding: list[float], book_id: int | None = None, memory_type: str | None = None, top_k: int = 5):
        """语义检索记忆。

        Args:
            user_id: 用户 ID。
            query_embedding: 查询向量。
            book_id: 书籍 ID，可选。
            memory_type: 记忆类型，可选。
            top_k: 返回结果数。

        Returns:
            (AgentMemory, distance) 元组列表。
        """
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
