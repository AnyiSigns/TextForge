from typing import Annotated

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import select

from domains.book.repository import CharacterRepository
from domains.world.repository import WorldRepository

logger = get_logger(__name__)


def _normalize_status(value: str | None) -> str | None:
    """兼容中英文状态词：前端 initializerStore 可能写入 '进行中'/'已埋下' 等中文值。"""
    if not value:
        return value
    aliases = {
        "埋下": "planted", "已埋下": "planted", "已回收": "resolved", "已放弃": "abandoned",
        "进行中": "active", "已完成": "completed", "已暂停": "paused", "已中断": "abandoned",
    }
    return aliases.get(value, value)


def _build_lookup_tools(session_factory):
    @tool
    async def lookup_characters(
        names: Annotated[list[str] | None, "要查询的角色名称列表，为空则返回全部角色"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的角色信息，可按名称筛选。

        Args:
            names: 要查询的角色名称列表，为空则返回当前书籍的全部角色。
        """
        logger.debug(f"[tool] lookup_characters  user_id={user_id}  book_id={book_id}  names={names}")
        async with session_factory() as session:
            characters = await CharacterRepository(session).book_character_detail(user_id=user_id, book_id=book_id)
            if names:
                characters = [c for c in characters if c.name in names]
            return [
                {
                    "id": c.id, "name": c.name, "aliases": c.aliases or [],
                    "description": c.description, "role_type": c.role_type,
                    "status": c.status, "relationship_chain": c.relationship_chain or [],
                    "avatar_url": c.avatar_url, "locked": c.locked,
                }
                for c in characters
            ]

    @tool
    async def lookup_locations(
        query: Annotated[str | None, "搜索关键词，匹配地点名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的地点信息，可按关键词搜索。

        Args:
            query: 搜索关键词，匹配地点名称或描述，为空则返回全部地点。
        """
        logger.debug(f"[tool] lookup_locations  book_id={book_id}  query={query}")
        async with session_factory() as session:
            locations = await WorldRepository(session).list_locations(book_id)
            if query:
                locations = [loc for loc in locations if query in (loc.name or "") or query in (loc.description or "")]
            return [
                {
                    "id": loc.id, "name": loc.name, "type": loc.type,
                    "description": loc.description, "parent_id": loc.parent_id,
                    "attributes": loc.attributes or {}, "locked": loc.locked,
                }
                for loc in locations
            ]

    @tool
    async def lookup_timeline(
        up_to_chapter: Annotated[int | None, "只返回在此章节ID及更早（≤ 该章）的事件"] = None,
        limit: Annotated[int, "返回结果数量上限"] = 20,
        query: Annotated[str | None, "搜索关键词，匹配事件名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍的时间线事件（即场景事件 scene_event，与 get_book_context 的 scene_events / build_outline 的 scene_events 同一实体），可按章节位置和关键词筛选。

        Args:
            up_to_chapter: 只返回章节ID不超过此值的事件（含该章），为空则不过滤。
            limit: 返回结果的最大数量。
            query: 搜索关键词，匹配事件名称或描述。
        """
        logger.debug(f"[tool] lookup_timeline  book_id={book_id}  up_to={up_to_chapter}  limit={limit}")
        async with session_factory() as session:
            events = await WorldRepository(session).list_scene_events(book_id)
            if up_to_chapter is not None:
                filtered = []
                for event in events:
                    if event.chapter_id is None:
                        filtered.append(event)
                        continue
                    try:
                        if int(event.chapter_id) <= int(up_to_chapter):
                            filtered.append(event)
                    except Exception as exc:
                        logger.warning(f"过滤 timeline 事件 chapter_id 转换失败: {exc}")
                events = filtered
            if query:
                events = [ev for ev in events if query in (ev.title or "") or query in (ev.content or "")]
            return [
                {
                    "id": ev.id, "title": ev.title, "content": ev.content,
                    "sort_order": ev.sort_order, "chapter_id": ev.chapter_id,
                    "event_type": ev.event_type, "character_ids": ev.character_ids or [],
                    "location_id": ev.location_id, "locked": ev.locked,
                }
                for ev in events[:limit]
            ]

    @tool
    async def lookup_foreshadowing(
        status: Annotated[str, "伏笔状态筛选：planted/resolved/abandoned"] = "planted",
        query: Annotated[str | None, "搜索关键词，匹配伏笔描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的伏笔信息，可按状态和关键词筛选。

        Args:
            status: 伏笔状态筛选，可选 planted（已埋下）、resolved（已回收）、abandoned（已放弃）。
            query: 搜索关键词，匹配伏笔描述。
        """
        logger.debug(f"[tool] lookup_foreshadowing  book_id={book_id}  status={status}")
        async with session_factory() as session:
            items = await WorldRepository(session).list_foreshadowings(book_id, status=_normalize_status(status))
            if query:
                items = [item for item in items if query in (item.description or "")]
            return [
                {
                    "id": item.id, "description": item.description, "status": item.status,
                    "planted_at_chapter_id": item.planted_at_chapter_id,
                    "resolved_at_chapter_id": item.resolved_at_chapter_id,
                    "related_character_ids": item.related_character_ids or [],
                    "related_event_id": item.related_event_id,
                    "reveal_type": item.reveal_type, "notes": item.notes, "locked": item.locked,
                }
                for item in items
            ]

    @tool
    async def lookup_plot_threads(
        status: Annotated[str, "线索状态筛选：active/completed/paused"] = "active",
        query: Annotated[str | None, "搜索关键词，匹配线索名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的剧情线索，可按状态和关键词筛选。

        Args:
            status: 线索状态筛选，可选 active（进行中）、completed（已完成）、paused（暂停）。
            query: 搜索关键词，匹配线索名称或描述。
        """
        logger.debug(f"[tool] lookup_plot_threads  book_id={book_id}  status={status}")
        async with session_factory() as session:
            items = await WorldRepository(session).list_plot_threads(book_id)
            if status:
                target = _normalize_status(status)
                items = [item for item in items if item.status == target]
            if query:
                items = [item for item in items if query in (item.name or "") or query in (item.description or "")]
            return [
                {
                    "id": item.id, "name": item.name, "description": item.description,
                    "status": item.status, "parent_thread_id": item.parent_thread_id,
                    "type": item.type, "related_character_ids": item.related_character_ids or [],
                    "start_chapter_id": item.start_chapter_id, "end_chapter_id": item.end_chapter_id,
                    "progress_note": item.progress_note, "locked": item.locked,
                }
                for item in items
            ]

    @tool
    async def lookup_sim_branches(
        branch_type: Annotated[str | None, "支线类型筛选：backstory/relationship/plot-thread/foreshadow-fill/voice-test"] = None,
        query: Annotated[str | None, "搜索关键词，匹配支线标题或内容"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的角色支线（角色模拟对话沉淀的结构化素材），可按类型和关键词筛选。

        支线是角色模拟对话中沉淀的创作素材，类型包括：
        backstory（角色背景）、relationship（关系线）、plot-thread（剧情线索）、
        foreshadow-fill（伏笔揭示）、voice-test（语音测试）。

        Args:
            branch_type: 支线类型筛选，不传则返回全部。
            query: 搜索关键词，匹配支线标题或内容。
            book_id: 当前活动书籍 ID（自动注入）。
        """
        logger.debug(f"[tool] lookup_sim_branches  book_id={book_id}  branch_type={branch_type}")
        from models.sim_room import SimBranch, SimRoom

        async with session_factory() as session:
            stmt = (
                select(SimBranch)
                .join(SimRoom, SimRoom.id == SimBranch.room_id)
                .where(SimRoom.book_id == book_id)
                .order_by(SimBranch.created_at.desc())
            )
            items = (await session.execute(stmt)).scalars().all()
            if branch_type:
                items = [item for item in items if item.branch_type == branch_type]
            if query:
                items = [
                    item for item in items
                    if query in (item.title or "") or query in (item.content or "")
                ]
            return [item.to_agent_dict() for item in items]

    return [
        lookup_characters,
        lookup_locations,
        lookup_timeline,
        lookup_foreshadowing,
        lookup_plot_threads,
        lookup_sim_branches,
    ]
