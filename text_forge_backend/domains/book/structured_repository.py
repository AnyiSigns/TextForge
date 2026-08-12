from collections import defaultdict
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


def _chain_rel(rel) -> dict:
    """关系链条目归一化（dict 与对象两种形态）。

    键约定固定为 {targetId, type, description}（前端全应用写入，数据库重建后
    无存量旧键）。统一收敛为 {target, relation} 供 Agent 消费。
    """
    if isinstance(rel, dict):
        return {
            "target": rel.get("targetId") or rel.get("targetName") or "",
            "relation": rel.get("type") or "",
        }
    return {
        "target": getattr(rel, "target_id", None) or getattr(rel, "target_name", None) or "",
        "relation": getattr(rel, "type", None) or "",
    }


class StructuredRepository:
    """结构化上下文查询：全部返回轻量快照（SimpleNamespace/dict），
    杜绝 ORM 实例跨会话访问延迟加载属性（DetachedInstanceError）。"""

    FIELD_MAP = {
        "book_info": Book,
        "setting": CreativeSetting,
        "characters": Character,
        "character_relationships": Character,
        "previous_chapters": Chapter,
        "outline_detail": Chapter,
        "outline_detail.toc": Chapter,
        "outline_detail.volume_summaries": Chapter,
        "outline_detail.chapter_summaries": Chapter,
        "outline_detail.chapter_scene_event": SceneEvent,
        "locations": Location,
        "foreshadowings": Foreshadowing,
        "plot_threads": PlotThread,
        "branches": SimBranch,
    }

    FIELD_ALIAS = {
        "chapters": "previous_chapters",
        "outline": "outline_detail.chapter_summaries",
        "creative_settings": "setting",
        "chapter_content": "previous_chapters",
        "recent_chapters": "previous_chapters",
        "outline_structure": "outline_detail.chapter_summaries",
        "volumes": "outline_detail.volume_summaries",
        "scene_events": "outline_detail.chapter_scene_event",
    }

    def __init__(self, session: AsyncSession):
        self.session = session

    async def query_by_fields(
        self,
        book_id: int,
        context_fields: list[str],
        context_pool: dict[str, list[int]] | None = None,
        target_chapter_id: int | None = None,
    ) -> dict[str, list[Any]]:
        pool = context_pool or {}
        character_ids = pool.get("character_ids") or []

        results: dict[str, list[Any]] = {}
        for field in context_fields:
            normalized = self.FIELD_ALIAS.get(field, field)
            if normalized not in self.FIELD_MAP:
                continue
            try:
                if normalized in (
                    "outline_detail",
                    "outline_detail.toc",
                    "outline_detail.volume_summaries",
                    "outline_detail.chapter_summaries",
                ):
                    rows = await self._query_outline_tree(book_id)
                elif normalized == "outline_detail.chapter_scene_event":
                    rows = await self._query_chapter_scene_event(book_id, target_chapter_id)
                elif normalized == "previous_chapters":
                    rows = await self._query_previous_chapters(book_id, target_chapter_id)
                elif normalized == "locations":
                    rows = await self._query_location_snapshots(book_id)
                elif normalized == "characters":
                    rows = await self._query_character_snapshots(book_id, character_ids, with_chain=False)
                elif normalized == "character_relationships":
                    rows = await self._query_character_snapshots(book_id, character_ids, with_chain=True)
                elif normalized == "setting":
                    rows = await self._query_setting_snapshots(book_id)
                elif normalized == "book_info":
                    rows = await self._query_book_info(book_id)
                elif normalized == "foreshadowings":
                    rows = await self._query_foreshadowing_snapshots(book_id)
                elif normalized == "plot_threads":
                    rows = await self._query_plot_thread_snapshots(book_id)
                elif normalized == "branches":
                    rows = await self._query_branch_snapshots(book_id)
                else:
                    rows = []
                results[normalized] = rows
            except Exception:
                results[normalized] = []
        return results

    # ---------- 单字段查询（全部快照化） ----------

    async def _query_book_info(self, book_id: int) -> list[Any]:
        row = (
            await self.session.execute(select(Book).where(Book.id == book_id))
        ).scalars().first()
        if not row:
            return []
        return [
            SimpleNamespace(
                id=row.id,
                title=row.title,
                description=row.description or "",
                genre=row.genre or "",
            )
        ]

    async def _query_setting_snapshots(self, book_id: int) -> list[Any]:
        rows = (
            await self.session.execute(
                select(CreativeSetting).where(CreativeSetting.book_id == book_id)
            )
        ).scalars().all()
        return [
            SimpleNamespace(
                worldview=getattr(r, "worldview", "") or "",
                tone=getattr(r, "tone", "") or "",
                writing_taboos=getattr(r, "writing_taboos", "") or "",
                custom_dimensions=dict(getattr(r, "custom_dimensions", None) or {}),
            )
            for r in rows
        ]

    async def _query_character_snapshots(
        self,
        book_id: int,
        character_ids: list[int] | None,
        with_chain: bool,
    ) -> list[Any]:
        stmt = select(Character).where(Character.book_id == book_id)
        if character_ids:
            stmt = stmt.where(Character.id.in_(character_ids))
        stmt = stmt.order_by(Character.created_at, Character.id)
        rows = (await self.session.execute(stmt)).scalars().all()
        if not rows:
            return []
        loc_name_map = await self._load_location_name_map(book_id)
        snapshots = []
        for r in rows:
            base = {
                "id": r.id,
                "name": r.name,
                "aliases": list(r.aliases or []),
                "description": r.description or "",
                "role_type": r.role_type or "",
                "status": r.status or "",
                "custom_fields": dict(r.custom_fields or {}),
                "base_location_name": loc_name_map.get(r.base_location_id, "") if r.base_location_id else "",
            }
            if with_chain:
                base["relationship_chain"] = [_chain_rel(rel) for rel in (r.relationship_chain or [])]
            snapshots.append(SimpleNamespace(**base))
        return snapshots

    async def _query_previous_chapters(
        self,
        book_id: int,
        target_chapter_id: int | None,
    ) -> list[Any]:
        stmt = (
            select(Chapter)
            .join(Volume, Volume.id == Chapter.volume_id)
            .where(Volume.book_id == book_id)
            .order_by(Volume.sort_order, Chapter.sort_order, Chapter.id)
        )
        chapters = (await self.session.execute(stmt)).scalars().all()
        if not chapters:
            return []
        prev = None
        if target_chapter_id:
            idx = next(
                (i for i, c in enumerate(chapters) if c.id == target_chapter_id),
                None,
            )
            if idx is not None and idx > 0:
                prev = chapters[idx - 1]
        else:
            prev = chapters[-1]
        if prev is None:
            return []
        cc = (
            await self.session.execute(
                select(ChapterContent)
                .where(ChapterContent.chapter_id == prev.id)
                .order_by(ChapterContent.id.desc())
            )
        ).scalars().first()
        vol = await self.session.get(Volume, prev.volume_id)
        return [
            SimpleNamespace(
                id=prev.id,
                title=prev.title,
                summary=prev.summary or "",
                content=cc.content if cc else "",
                sort_order=prev.sort_order,
                volume_title=vol.title if vol else "",
            )
        ]

    async def _query_outline_tree(self, book_id: int) -> list[Any]:
        """卷 → 章 → 场景事件 三层树（与详情页大纲一致）。"""
        vols = (
            await self.session.execute(
                select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
            )
        ).scalars().all()
        chapters = (
            await self.session.execute(
                select(Chapter)
                .join(Volume, Volume.id == Chapter.volume_id)
                .where(Volume.book_id == book_id)
                .order_by(Volume.sort_order, Chapter.sort_order, Chapter.id)
            )
        ).scalars().all()
        events = (
            await self.session.execute(
                select(SceneEvent)
                .where(SceneEvent.book_id == book_id)
                .order_by(SceneEvent.story_ts, SceneEvent.sort_order, SceneEvent.id)
            )
        ).scalars().all()
        chapters_by_vol: dict[int, list[Chapter]] = defaultdict(list)
        for ch in chapters:
            chapters_by_vol[ch.volume_id].append(ch)
        events_by_ch: dict[int, list[SceneEvent]] = defaultdict(list)
        for ev in events:
            events_by_ch[ev.chapter_id].append(ev)
        tree = []
        for v in vols:
            ch_nodes = []
            for ch in chapters_by_vol.get(v.id, []):
                ev_nodes = [
                    SimpleNamespace(
                        id=ev.id, title=ev.title, story_label=ev.story_label or ""
                    )
                    for ev in events_by_ch.get(ch.id, [])
                ]
                ch_nodes.append(
                    SimpleNamespace(
                        id=ch.id,
                        title=ch.title,
                        summary=ch.summary or "",
                        sort_order=ch.sort_order,
                        events=ev_nodes,
                    )
                )
            tree.append(
                SimpleNamespace(
                    id=v.id,
                    title=v.title,
                    summary=v.summary or "",
                    sort_order=v.sort_order,
                    chapters=ch_nodes,
                )
            )
        return tree

    async def _query_chapter_scene_event(
        self,
        book_id: int,
        target_chapter_id: int | None,
    ) -> list[Any]:
        """本章场景全量：事件 + 地点及链 + 出场角色及直属链 + 内联线索/伏笔。

        深度边界：地点父链上溯到根、下探仅直属子地点；角色止于 2 层
        （出场角色带直属关系链，链目标角色只带基本信息，不追其链）。
        """
        chapter = None
        if target_chapter_id:
            chapter = await self.session.get(Chapter, target_chapter_id)
        if chapter is None:
            chapter = (
                await self.session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Volume.book_id == book_id)
                    .order_by(Volume.sort_order.desc(), Chapter.sort_order.desc(), Chapter.id.desc())
                    .limit(1)
                )
            ).scalars().first()
        if chapter is None:
            return []
        vol = await self.session.get(Volume, chapter.volume_id)
        chapter_snap = SimpleNamespace(
            id=chapter.id,
            title=chapter.title,
            sort_order=chapter.sort_order,
            volume_title=vol.title if vol else "",
        )
        events = (
            await self.session.execute(
                select(SceneEvent)
                .where(SceneEvent.chapter_id == chapter.id)
                .order_by(SceneEvent.story_ts, SceneEvent.sort_order, SceneEvent.id)
            )
        ).scalars().all()
        if not events:
            return [SimpleNamespace(chapter=chapter_snap, events=[])]

        # 地点快照（父链 + 直属子）
        locs = await self._query_location_snapshots(book_id)
        loc_by_id = {l.id: l for l in locs}
        loc_name_map = {l.id: l.name for l in locs}

        # 出场角色
        char_ids: list[int] = []
        for ev in events:
            char_ids.extend(ev.character_ids or [])
        char_ids = list(dict.fromkeys(char_ids))
        char_map: dict[int, Character] = {}
        if char_ids:
            for c in (
                await self.session.execute(
                    select(Character).where(Character.id.in_(char_ids))
                )
            ).scalars().all():
                char_map[c.id] = c

        # 关系链目标反查索引（name + aliases）
        name_index: dict[str, Character] = {}
        for c in (
            await self.session.execute(
                select(Character).where(Character.book_id == book_id)
            )
        ).scalars().all():
            name_index[c.name] = c
            for a in (c.aliases or []):
                name_index.setdefault(a, c)

        # 内联情节线 / 伏笔（事件绑定的）
        thread_ids: set[int] = set()
        fw_ids: set[int] = set()
        for ev in events:
            thread_ids.update(ev.plot_thread_ids or [])
            thread_ids.update(ev.completed_plot_thread_ids or [])
            fw_ids.update(ev.resolved_foreshadowing_ids or [])
        threads: dict[int, PlotThread] = {}
        if thread_ids:
            for t in (
                await self.session.execute(
                    select(PlotThread).where(PlotThread.id.in_(thread_ids))
                )
            ).scalars().all():
                threads[t.id] = t
        fws: dict[int, Foreshadowing] = {}
        if fw_ids:
            for f in (
                await self.session.execute(
                    select(Foreshadowing).where(Foreshadowing.id.in_(fw_ids))
                )
            ).scalars().all():
                fws[f.id] = f

        event_nodes = []
        for ev in events:
            location = loc_by_id.get(ev.location_id) if ev.location_id else None
            loc_snap = None
            if location:
                loc_snap = SimpleNamespace(
                    id=location.id,
                    name=location.name,
                    type=location.type,
                    description=location.description,
                    ancestors=[
                        SimpleNamespace(id=a.id, name=a.name, type=a.type)
                        for a in location.ancestors
                    ],
                    children=[
                        SimpleNamespace(id=c.id, name=c.name, type=c.type)
                        for c in location.children
                    ],
                )

            char_nodes = []
            for cid in (ev.character_ids or []):
                c = char_map.get(cid)
                if c is None:
                    continue
                chain_entries = []
                chain_chars = []
                for rel in (c.relationship_chain or [])[:8]:
                    entry = _chain_rel(rel)
                    chain_entries.append(entry)
                    tc = name_index.get(entry["target"])
                    if tc is not None:
                        chain_chars.append(
                            SimpleNamespace(
                                id=tc.id,
                                name=tc.name,
                                aliases=list(tc.aliases or []),
                                description=tc.description or "",
                                role_type=tc.role_type or "",
                                status=tc.status or "",
                                custom_fields=dict(tc.custom_fields or {}),
                                base_location_name=loc_name_map.get(tc.base_location_id, "")
                                if tc.base_location_id
                                else "",
                            )
                        )
                char_nodes.append(
                    SimpleNamespace(
                        id=c.id,
                        name=c.name,
                        aliases=list(c.aliases or []),
                        description=c.description or "",
                        role_type=c.role_type or "",
                        status=c.status or "",
                        custom_fields=dict(c.custom_fields or {}),
                        base_location_name=loc_name_map.get(c.base_location_id, "")
                        if c.base_location_id
                        else "",
                        relationship_chain=chain_entries,
                        chain_characters=chain_chars,
                    )
                )

            event_nodes.append(
                SimpleNamespace(
                    id=ev.id,
                    title=ev.title,
                    content=ev.content or "",
                    event_type=ev.event_type or "",
                    story_label=ev.story_label or "",
                    location=loc_snap,
                    characters=char_nodes,
                    plot_threads=[
                        SimpleNamespace(id=t.id, name=t.name, status=t.status or "")
                        for t in (threads.get(i) for i in (ev.plot_thread_ids or []))
                        if t
                    ],
                    completed_plot_threads=[
                        SimpleNamespace(id=t.id, name=t.name, status=t.status or "")
                        for t in (threads.get(i) for i in (ev.completed_plot_thread_ids or []))
                        if t
                    ],
                    foreshadowings=[
                        SimpleNamespace(
                            id=f.id, description=f.description or "", status=f.status or ""
                        )
                        for f in (fws.get(i) for i in (ev.resolved_foreshadowing_ids or []))
                        if f
                    ],
                )
            )

        return [SimpleNamespace(chapter=chapter_snap, events=event_nodes)]

    async def _query_location_snapshots(self, book_id: int) -> list[Any]:
        rows = (
            await self.session.execute(
                select(Location).where(Location.book_id == book_id).order_by(Location.created_at, Location.id)
            )
        ).scalars().all()
        locs = [
            SimpleNamespace(
                id=r.id,
                name=r.name,
                type=getattr(r, "type", "场所") or "场所",
                description=r.description or "",
                parent_id=r.parent_id,
            )
            for r in rows
        ]
        by_id = {l.id: l for l in locs}
        for l in locs:
            l.children = [c for c in locs if c.parent_id == l.id]
            l.ancestors = []
            cur = by_id.get(l.parent_id)
            visited: set[int] = set()
            # 防环：parent_id 自引用/成环时终止上溯（同步循环，环会阻塞事件循环）
            while cur is not None and cur.id not in visited:
                visited.add(cur.id)
                l.ancestors.insert(0, cur)
                cur = by_id.get(cur.parent_id)
        return locs

    async def _load_location_name_map(self, book_id: int) -> dict[int, str]:
        rows = (
            await self.session.execute(
                select(Location.id, Location.name).where(Location.book_id == book_id)
            )
        ).all()
        return {r.id: r.name for r in rows}

    async def _query_foreshadowing_snapshots(self, book_id: int) -> list[Any]:
        rows = (
            await self.session.execute(
                select(Foreshadowing)
                .where(Foreshadowing.book_id == book_id)
                .order_by(Foreshadowing.created_at, Foreshadowing.id)
            )
        ).scalars().all()
        return [
            SimpleNamespace(
                id=r.id,
                description=r.description or "",
                status=r.status or "",
                planted_at_chapter_id=r.planted_at_chapter_id,
                resolved_at_chapter_id=getattr(r, "resolved_at_chapter_id", None),
            )
            for r in rows
        ]

    async def _query_plot_thread_snapshots(self, book_id: int) -> list[Any]:
        rows = (
            await self.session.execute(
                select(PlotThread)
                .where(PlotThread.book_id == book_id)
                .order_by(PlotThread.created_at, PlotThread.id)
            )
        ).scalars().all()
        return [
            SimpleNamespace(
                id=r.id,
                name=r.name,
                description=r.description or "",
                type=getattr(r, "type", "") or "",
                status=r.status or "",
                progress_note=getattr(r, "progress_note", "") or "",
            )
            for r in rows
        ]

    async def _query_branch_snapshots(self, book_id: int) -> list[Any]:
        stmt = (
            select(SimBranch)
            .join(SimRoom, SimRoom.id == SimBranch.room_id)
            .where(SimRoom.book_id == book_id)
            .order_by(SimBranch.created_at, SimBranch.id)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            SimpleNamespace(
                id=r.id,
                title=r.title,
                branch_type=getattr(r, "branch_type", "") or "",
                content=r.content or "",
                status=r.status or "",
            )
            for r in rows
        ]
