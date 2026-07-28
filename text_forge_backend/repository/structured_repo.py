from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Any

from model.book import Character, CreativeSetting, Outline, Chapter


class StructuredRepository:
    FIELD_MAP = {
        "characters": Character,
        "creative_settings": CreativeSetting,
        "outline": Outline,
        "chapters": Chapter,
    }

    def __init__(self, session: AsyncSession):
        self.session = session

    async def query_by_fields(
        self, book_id: int, context_fields: List[str]
    ) -> Dict[str, List[Any]]:
        results: Dict[str, List[Any]] = {}
        for field in context_fields:
            model = self.FIELD_MAP.get(field)
            if not model:
                continue
            stmt = select(model)
            if hasattr(model, "book_id"):
                stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            results[field] = list(rows)
        return results
