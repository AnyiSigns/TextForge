from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import (
    Book,
    Chapter,
    ChapterContent,
    Character,
    CreativeSetting,
    Foreshadowing,
    Location,
    PlotThread,
    SceneEvent,
    Volume,
)
from models.sim_room import SimBranch, SimRoom


class StructuredRepository:
    FIELD_MAP = {
        "book_info": Book,
        "setting": CreativeSetting,
        "characters": Character,
        "character_relationships": Character,
        "chapter_content": ChapterContent,
        "chapter_summaries": Chapter,
        "recent_chapters": Chapter,
        "outline_structure": Chapter,
        "volumes": Volume,
        "locations": Location,
        "scene_events": SceneEvent,
        "foreshadowings": Foreshadowing,
        "plot_threads": PlotThread,
        "branches": SimBranch,
    }

    FIELD_ALIAS = {
        "chapters": "chapter_content",
        "outline": "outline_structure",
    }

    def __init__(self, session: AsyncSession):
        self.session = session

    async def query_by_fields(
        self,
        book_id: int,
        context_fields: list[str],
        context_pool: dict[str, list[int]] | None = None,
    ) -> dict[str, list[Any]]:
        pool = context_pool or {}
        character_ids = pool.get("character_ids") or []
        chapter_content_ids = pool.get("chapter_content_ids") or []
        chapter_summary_ids = pool.get("chapter_summary_ids") or []
        volume_ids = pool.get("volume_ids") or []
        outline_node_ids = pool.get("outline_node_ids") or []

        results: dict[str, list[Any]] = {}
        for field in context_fields:
            normalized = self.FIELD_ALIAS.get(field, field)
            model = self.FIELD_MAP.get(normalized)
            if not model:
                continue
            try:
                rows = await self._query_field(
                    field=normalized,
                    model=model,
                    book_id=book_id,
                    character_ids=character_ids,
                    chapter_content_ids=chapter_content_ids,
                    chapter_summary_ids=chapter_summary_ids,
                    volume_ids=volume_ids,
                    outline_node_ids=outline_node_ids,
                )
                results[field] = rows
            except Exception:
                results[field] = []
        return results

    async def _query_field(
        self,
        field: str,
        model,
        book_id: int,
        character_ids: list[int] | None,
        chapter_content_ids: list[int] | None,
        chapter_summary_ids: list[int] | None,
        volume_ids: list[int] | None,
        outline_node_ids: list[int] | None,
    ) -> list[Any]:
        stmt = select(model)

        if field == "book_info":
            stmt = stmt.where(model.id == book_id)
            stmt = stmt.with_only_columns(
                model.id, model.title, model.description, model.genre, model.created_at
            )
            query_result = await self.session.execute(stmt)
            rows = [dict(r._mapping) for r in query_result.all()]
            return [self._format_book_info(row) for row in rows]

        if field == "setting":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "characters":
            stmt = stmt.where(model.book_id == book_id)
            if character_ids:
                stmt = stmt.where(model.id.in_(character_ids))
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "character_relationships":
            stmt = stmt.where(model.book_id == book_id)
            if character_ids:
                stmt = stmt.where(model.id.in_(character_ids))
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "chapter_content":
            if chapter_content_ids:
                stmt = stmt.where(model.chapter_id.in_(chapter_content_ids))
            else:
                return []
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "chapter_summaries":
            if chapter_summary_ids:
                stmt = stmt.where(model.id.in_(chapter_summary_ids))
            else:
                return []
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "recent_chapters":
            ids = list(dict.fromkeys(chapter_content_ids + chapter_summary_ids))
            if not ids:
                return []
            stmt = stmt.where(model.id.in_(ids))
            query_result = await self.session.execute(stmt)
            chapter_rows = {c.id: c for c in query_result.scalars().all()}
            if not chapter_rows:
                return []
            content_stmt = select(ChapterContent).where(
                ChapterContent.chapter_id.in_(list(chapter_rows.keys()))
            )
            content_result = await self.session.execute(content_stmt)
            content_map = {cc.chapter_id: cc for cc in content_result.scalars().all()}
            merged = []
            for ch in chapter_rows.values():
                cc = content_map.get(ch.id)
                # 注意：绝不能写 ch.summary = cc.content 修改 ORM 实例——
                # 会话内其他逻辑（甚至提交 flush）会读到被污染的字段。
                # 返回轻量命名对象，把正文放在 content 属性供渲染层使用。
                merged.append(
                    SimpleNamespace(
                        id=ch.id,
                        title=ch.title,
                        summary=ch.summary or "",
                        content=cc.content if cc else "",
                        sort_order=ch.sort_order,
                    )
                )
            return merged

        if field == "outline_structure":
            # Chapter 表无 book_id，需 join Volume 按书过滤；大纲即本书全部章节（按卷/排序）
            stmt = (
                select(model)
                .join(Volume, Volume.id == model.volume_id)
                .where(Volume.book_id == book_id)
                .order_by(Volume.sort_order, model.sort_order)
            )
            selected_ids = list(outline_node_ids or [])
            if selected_ids:
                stmt = stmt.where(model.id.in_(selected_ids))
            query_result = await self.session.execute(stmt)
            return query_result.scalars().all()

        if field == "volumes":
            stmt = stmt.where(model.book_id == book_id)
            if volume_ids:
                stmt = stmt.where(model.id.in_(volume_ids))
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "locations":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "scene_events":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "foreshadowings":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "plot_threads":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "branches":
            # 支线挂在 sim_rooms 下（SimBranch 无 book_id 列），需 join 房间按书过滤
            stmt = (
                select(SimBranch)
                .join(SimRoom, SimRoom.id == SimBranch.room_id)
                .where(SimRoom.book_id == book_id)
                .order_by(SimBranch.created_at)
            )
            query_result = await self.session.execute(stmt)
            return query_result.scalars().all()

        return []

    @staticmethod
    def _format_book_info(row: dict) -> dict:
        return {
            "id": row.get("id"),
            "title": row.get("title"),
            "description": row.get("description"),
            "genre": row.get("genre"),
            "created_at": row.get("created_at"),
        }
