from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Any, Optional

from models.book import Book, Character, CreativeSetting, Outline, Chapter, Volume, ChapterContent, Location, TimelineEvent, Foreshadowing, PlotThread


class StructuredRepository:
    FIELD_MAP = {
        "book_info": Book,
        "setting": CreativeSetting,
        "characters": Character,
        "character_relationships": Character,
        "chapter_content": ChapterContent,
        "chapter_summaries": Chapter,
        "recent_chapters": Chapter,
        "outline_structure": Outline,
        "volumes": Volume,
        "locations": Location,
        "timeline_events": TimelineEvent,
        "foreshadowings": Foreshadowing,
        "plot_threads": PlotThread,
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
        context_fields: List[str],
        context_pool: Optional[Dict[str, List[int]]] = None,
    ) -> Dict[str, List[Any]]:
        pool = context_pool or {}
        character_ids = pool.get("character_ids") or []
        chapter_content_ids = pool.get("chapter_content_ids") or []
        chapter_summary_ids = pool.get("chapter_summary_ids") or []
        volume_ids = pool.get("volume_ids") or []
        outline_node_ids = pool.get("outline_node_ids") or []

        results: Dict[str, List[Any]] = {}
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
        character_ids: Optional[List[int]],
        chapter_content_ids: Optional[List[int]],
        chapter_summary_ids: Optional[List[int]],
        volume_ids: Optional[List[int]],
        outline_node_ids: Optional[List[int]],
    ) -> List[Any]:
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
            stmt = stmt.options(
                getattr(model, "worldview"),
                getattr(model, "tone"),
                getattr(model, "writing_taboos"),
                getattr(model, "custom_dimensions"),
            )
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "characters":
            stmt = stmt.where(model.book_id == book_id)
            if character_ids:
                stmt = stmt.where(model.id.in_(character_ids))
            stmt = stmt.options(
                getattr(model, "name"),
                getattr(model, "aliases"),
                getattr(model, "description"),
                getattr(model, "role_type"),
                getattr(model, "status"),
                getattr(model, "relationship_chain"),
            )
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "character_relationships":
            stmt = stmt.where(model.book_id == book_id)
            if character_ids:
                stmt = stmt.where(model.id.in_(character_ids))
            stmt = stmt.options(
                getattr(model, "name"),
                getattr(model, "relationship_chain"),
            )
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
            stmt = stmt.options(
                getattr(model, "id"),
                getattr(model, "title"),
                getattr(model, "summary"),
            )
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "recent_chapters":
            ids = list(dict.fromkeys(chapter_content_ids + chapter_summary_ids))
            if not ids:
                return []
            stmt = stmt.where(model.id.in_(ids))
            stmt = stmt.options(
                getattr(model, "id"),
                getattr(model, "title"),
                getattr(model, "summary"),
            )
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
                ch.content = cc.content if cc else ""
                merged.append(ch)
            return merged

        if field == "outline_structure":
            stmt = stmt.where(model.book_id == book_id)
            selected_ids = list(outline_node_ids or [])
            if selected_ids:
                parent_stmt = select(model.id, model.parent_id).where(model.book_id == book_id)
                parent_res = await self.session.execute(parent_stmt)
                parent_map = {row[0]: row[1] for row in parent_res.all() if row[0] is not None}

                ancestor_ids = set()
                for node_id in selected_ids:
                    current = node_id
                    while current and current in parent_map:
                        parent = parent_map[current]
                        if parent:
                            ancestor_ids.add(parent)
                        current = parent

                all_ids = list(set(selected_ids) | ancestor_ids)
                stmt = stmt.where(model.id.in_(all_ids))

            stmt = stmt.options(
                getattr(model, "node_type"),
                getattr(model, "title"),
                getattr(model, "content"),
                getattr(model, "parent_id"),
                getattr(model, "target_volume_id"),
                getattr(model, "target_chapter_id"),
            )
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()

            if selected_ids and rows:
                row_map = {r.id: r for r in rows}
                allowed = set()
                for node_id in selected_ids:
                    current = node_id
                    while current and current in row_map:
                        allowed.add(current)
                        current = parent_map.get(current)
                rows = [r for r in rows if r.id in allowed]

            return rows

        if field == "volumes":
            stmt = stmt.where(model.book_id == book_id)
            if volume_ids:
                stmt = stmt.where(model.id.in_(volume_ids))
            stmt = stmt.options(
                getattr(model, "id"),
                getattr(model, "title"),
                getattr(model, "summary"),
                getattr(model, "sort_order"),
            )
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "locations":
            stmt = stmt.where(model.book_id == book_id)
            query_result = await self.session.execute(stmt)
            rows = query_result.scalars().all()
            return rows

        if field == "timeline_events":
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
