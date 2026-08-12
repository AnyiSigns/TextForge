from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.context_config import BookContextConfig


class BookContextConfigRepository:
    """书籍上下文池仓储（当前仅角色范围过滤生效）。

    章节/卷/大纲范围字段曾随上下文池引入但从未被执行层消费（outline 树、
    previous_chapters 均全量加载），且前端无 UI 设置，属死字段已移除——
    上下文池仅保留 character_ids 这一个有消费者的键。
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_config(self, book_id: int) -> dict:
        stmt = select(BookContextConfig).where(BookContextConfig.book_id == book_id)
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if not row:
            return {"character_ids": []}
        return {"character_ids": list(row.character_ids or [])}

    async def save_config(self, book_id: int, data: dict) -> dict:
        stmt = (
            pg_insert(BookContextConfig)
            .values(
                book_id=book_id,
                character_ids=data.get("character_ids", []),
            )
            .on_conflict_do_update(
                index_elements=["book_id"],
                set_={
                    "character_ids": data.get("character_ids", []),
                    "updated_at": func.now(),
                },
            )
        )
        await self.session.execute(stmt)
        await self.session.commit()
        return await self.get_config(book_id)
