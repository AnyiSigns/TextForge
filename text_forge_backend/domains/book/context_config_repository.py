from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.context_config import BookContextConfig


class BookContextConfigRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_config(self, book_id: int) -> dict:
        stmt = select(BookContextConfig).where(BookContextConfig.book_id == book_id)
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if not row:
            return {
                "character_ids": [],
                "chapter_content_ids": [],
                "chapter_summary_ids": [],
                "volume_ids": [],
                "outline_node_ids": [],
            }
        return {
            "character_ids": list(row.character_ids or []),
            "chapter_content_ids": list(row.chapter_content_ids or []),
            "chapter_summary_ids": list(row.chapter_summary_ids or []),
            "volume_ids": list(row.volume_ids or []),
            "outline_node_ids": list(row.outline_node_ids or []),
        }

    async def save_config(self, book_id: int, data: dict) -> dict:
        stmt = (
            pg_insert(BookContextConfig)
            .values(
                book_id=book_id,
                character_ids=data.get("character_ids", []),
                chapter_content_ids=data.get("chapter_content_ids", []),
                chapter_summary_ids=data.get("chapter_summary_ids", []),
                volume_ids=data.get("volume_ids", []),
                outline_node_ids=data.get("outline_node_ids", []),
            )
            .on_conflict_do_update(
                index_elements=["book_id"],
                set_={
                    "character_ids": data.get("character_ids", []),
                    "chapter_content_ids": data.get("chapter_content_ids", []),
                    "chapter_summary_ids": data.get("chapter_summary_ids", []),
                    "volume_ids": data.get("volume_ids", []),
                    "outline_node_ids": data.get("outline_node_ids", []),
                    "updated_at": func.now(),
                },
            )
        )
        await self.session.execute(stmt)
        await self.session.commit()
        return await self.get_config(book_id)
