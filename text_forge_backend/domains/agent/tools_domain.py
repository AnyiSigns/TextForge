from typing import Annotated, Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import func, select

from config.logging import get_logger
from core.model_factory import ModelFactory
from domains.book.repository import CharacterRepository
from domains.knowledge.repository import VectorRepository
from domains.memory.service import AgentMemoryService
from domains.world.constants import (
    normalize_foreshadowing_status,
    normalize_plot_thread_status,
)
from domains.world.repository import WorldRepository
from models.book import (
    Book,
    Chapter,
    ChapterContent,
    Character,
    Volume,
)

from .web_search_service import WebSearchService

logger = get_logger(__name__)


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
    async def lookup_outline(
        chapter_id: Annotated[int | None, "指定章节ID，为空则返回全部章节"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍的大纲结构，返回卷和章节信息。

        Args:
            chapter_id: 指定要查询的章节ID，为空则返回全部章节。
        """
        logger.debug(f"[tool] lookup_outline  book_id={book_id}  chapter_id={chapter_id}")
        async with session_factory() as session:
            vol_stmt = select(Chapter.volume_id).join(Chapter.volume).join(Volume.book).where(Book.id == book_id)
            vol_res = await session.execute(vol_stmt)
            vol_ids = list({r[0] for r in vol_res.fetchall()})
            if not vol_ids:
                return []
            ch_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids)).order_by(Chapter.sort_order, Chapter.id)
            ch_res = await session.execute(ch_stmt)
            chapters = ch_res.scalars().all()
            if chapter_id is not None:
                chapters = [c for c in chapters if c.id == chapter_id]
            return [
                {
                    "id": c.id, "title": c.title, "content": "",
                    "summary": c.summary or "", "sort_order": c.sort_order,
                    "character_ids": c.character_ids or [], "locked": c.locked,
                }
                for c in chapters
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
        before_chapter: Annotated[int | None, "只返回在此章节之前的事件"] = None,
        limit: Annotated[int, "返回结果数量上限"] = 20,
        query: Annotated[str | None, "搜索关键词，匹配事件名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍的时间线事件，可按章节位置和关键词筛选。

        Args:
            before_chapter: 只返回在此章节ID之前的事件，为空则不过滤。
            limit: 返回结果的最大数量。
            query: 搜索关键词，匹配事件名称或描述。
        """
        logger.debug(f"[tool] lookup_timeline  book_id={book_id}  before={before_chapter}  limit={limit}")
        async with session_factory() as session:
            events = await WorldRepository(session).list_scene_events(book_id)
            if before_chapter is not None:
                filtered = []
                for event in events:
                    if event.chapter_id is None:
                        filtered.append(event)
                        continue
                    try:
                        if int(event.chapter_id) <= int(before_chapter):
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

    return [
        lookup_characters,
        lookup_outline,
        lookup_locations,
        lookup_timeline,
        lookup_foreshadowing,
        lookup_plot_threads,
    ]


def _normalize_status(value: str | None) -> str | None:
    """兼容中英文状态词：前端 initializerStore 可能写入 '进行中'/'已埋下' 等中文值。"""
    if not value:
        return value
    aliases = {
        "埋下": "planted", "已埋下": "planted", "已回收": "resolved", "已放弃": "abandoned",
        "进行中": "active", "已完成": "completed", "已暂停": "paused", "已中断": "abandoned",
    }
    return aliases.get(value, value)


async def _extract_entities_from_text(model_config, content: str) -> dict:
    """从原始文本一次性抽取人物/地点/事件，供 create_entities 的 source_text 模式使用。

    Args:
        model_config: 模型配置（用于初始化 LLM）。
        content: 待抽取的原始文本。

    Returns:
        含 characters/locations/scene_events 的字典；失败返回空字典。
    """
    if not content or not content.strip():
        return {}
    llm = None
    if model_config:
        try:
            llm = ModelFactory(model_config)
        except Exception as exc:
            logger.warning(f"_extract_entities_from_text 初始化模型失败: {exc}")
    if llm is None:
        return {}
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content="""你是实体提取助手。从给定文本中提取人物、地点、事件三类实体。

输出 JSON：{"characters":[{"name":"","description":"","role_type":""}],"locations":[{"name":"","type":"","description":""}],"scene_events":[{"title":"","content":"","event_type":""}]}

规则：
- 只输出 JSON，不要其他内容
- 忽略泛指群体（如"众人""士兵们"）
- description 简明扼要
- event_type 取 冲突/转折/揭示/过渡/日常 之一"""),
        ("human", "{content}"),
    ])
    try:
        chain = prompt | llm.main | JsonOutputParser()
        result = await chain.ainvoke({"content": content[:4000]})
    except Exception as exc:
        logger.warning(f"_extract_entities_from_text 提取失败: {exc}")
        return {}
    return result if isinstance(result, dict) else {}


def _build_agent_tools(session_factory, model_config: dict | None = None):
    lookup_tools = _build_lookup_tools(session_factory)

    @tool
    async def get_book_context(
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """获取当前书籍的完整上下文，包括基本信息、角色列表和卷宗结构。

        Returns:
            包含 book、characters、volumes 及数量统计的字典。
        """
        logger.debug(f"[tool] get_book_context  user_id={user_id}  book_id={book_id}")
        async with session_factory() as session:
            book_stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"error": "书籍不存在或无权访问"}
            char_stmt = select(Character).where(Character.book_id == book_id).order_by(Character.id)
            characters = (await session.execute(char_stmt)).scalars().all()
            vol_stmt = select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
            volumes = (await session.execute(vol_stmt)).scalars().all()
            return {
                "book": {
                    "id": book.id, "title": book.title,
                    "description": book.description, "genre": book.genre,
                    "total_word_goal": book.total_word_goal, "current_word_count": book.current_word_count,
                },
                "character_count": len(characters),
                "characters": [
                    {"id": c.id, "name": c.name, "role_type": c.role_type, "description": c.description}
                    for c in characters
                ],
                "volume_count": len(volumes),
                "volumes": [
                    {"id": v.id, "title": v.title, "summary": v.summary}
                    for v in volumes
                ],
            }

    TEXT_MODE_PROMPTS = {
        "polish": "你是专业的文字润色助手。改进文本的表达、节奏和可读性，保持原意不变。直接输出润色后的文本。",
        "rewrite": "你是专业的改写助手。根据用户指令改写文本，保持核心含义但改变表达方式。直接输出改写后的文本。",
        "expand": "你是专业的扩写助手。在保持原意和风格的基础上，丰富细节、描写和对话，使文本更加生动。直接输出扩写后的文本。",
        "summarize": "你是专业的摘要助手。请简洁地总结文本内容，保留关键信息和核心情节。",
        "alternatives": "你是写作建议助手。针对给定文本，提供多个不同风格的改写建议。",
    }

    @tool
    async def transform_text(
        text: Annotated[str, "需要加工的文本"],
        mode: Annotated[str, "加工模式：polish(润色)/rewrite(改写)/expand(扩写)/summarize(摘要)/alternatives(替代表达)"] = "polish",
        instruction: Annotated[str, "润色/改写的具体要求（polish/rewrite 使用）"] = "",
        target_length: Annotated[int | None, "扩写目标字数（expand 使用）"] = None,
        max_length: Annotated[int | None, "摘要最大字数（summarize 使用）"] = None,
        count: Annotated[int, "建议条数（alternatives 使用）"] = 3,
    ) -> dict:
        """对文本进行统一加工：润色、改写、扩写、摘要或生成替代表达。纯函数，不落库。"""
        logger.debug(f"[tool] transform_text  mode={mode}  text_len={len(text)}")
        if not text.strip():
            return {"error": "文本为空"}
        mode = mode or "polish"
        if mode not in TEXT_MODE_PROMPTS:
            return {"error": f"不支持的 mode: {mode}"}
        if mode == "polish":
            human = f"请润色以下文本：\n{text}\n润色要求：{instruction or '优化表达'}"
        elif mode == "rewrite":
            human = f"请改写以下文本：\n{text}\n改写要求：{instruction or '换个角度重写'}"
        elif mode == "expand":
            human = f"请扩写以下文本，目标字数约 {target_length or len(text) * 3} 字：\n{text}"
        elif mode == "summarize":
            human = f"请将以下文本总结为 {max_length or 200} 字以内的摘要：\n{text}"
        else:
            human = f"请提供 {count} 种不同风格的改写建议：\n{text}"
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"transform_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法加工文本"}
        system = SystemMessage(content=TEXT_MODE_PROMPTS[mode])
        human_msg = HumanMessage(content=human[:6000])
        try:
            result = await llm.main.ainvoke([system, human_msg])
            out = result.content if hasattr(result, "content") else str(result)
        except Exception as exc:
            logger.error(f"transform_text 失败: {exc}", exc_info=True)
            return {"error": f"加工失败: {exc}"}
        key_map = {
            "polish": "polished_text", "rewrite": "rewritten_text",
            "expand": "expanded_text", "summarize": "summary", "alternatives": "alternatives",
        }
        return {"mode": mode, "original_length": len(text), "result_length": len(out), key_map[mode]: out}

    @tool
    async def review_text(
        mode: Annotated[str, "检查模式：grammar(语法)/consistency(一致性)"] = "grammar",
        text: Annotated[str | None, "直接提供待检查文本（grammar 必填）"] = None,
        chapter_id: Annotated[int | None, "一致性检查的目标章节ID，为空则检查当前活跃章节最新内容"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """检查文本：grammar 检查语法错误，consistency 检查正文与设定（人物/地点/时间线）的一致性。"""
        logger.debug(f"[tool] review_text  mode={mode}  book_id={book_id}  chapter_id={chapter_id}")
        if mode not in ("grammar", "consistency"):
            return {"error": f"不支持的 mode: {mode}"}
        content = text or ""
        characters = locations = scene_events = None
        if mode == "consistency":
            async with session_factory() as session:
                book_stmt = select(Book).where(Book.id == book_id)
                book = (await session.execute(book_stmt)).scalar_one_or_none()
                if not book:
                    return {"error": "书籍不存在"}
                characters = await CharacterRepository(session).book_character_detail(user_id=book.user_id, book_id=book_id)
                locations = await WorldRepository(session).list_locations(book_id)
                scene_events = await WorldRepository(session).list_scene_events(book_id)
                if chapter_id:
                    cc_stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.version.desc()).limit(1)
                    cc = (await session.execute(cc_stmt)).scalar_one_or_none()
                    content = cc.content or "" if cc else ""
                if not content:
                    return {"error": "无正文内容可检查"}
        if not content.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"review_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法检查"}
        if mode == "grammar":
            system = SystemMessage(content="你是语法检查助手。检查文本中的语法、拼写和标点错误，列出问题并给出修正建议。")
            human = f"请检查以下文本的语法错误：\n{content[:4000]}"
        else:
            system = SystemMessage(content="你是 consistency 检查助手。检查正文中的人物、地点、时间线是否与设定一致。列出不一致的地方。")
            human = (
                f"书籍：{book.title}\n"
                f"人物：{[c.name for c in characters]}\n"
                f"地点：{[loc.name for loc in locations]}\n"
                f"时间线：{[ev.title for ev in scene_events]}\n\n"
                f"请检查以下正文中的一致性：\n{content[:4000]}"
            )
        try:
            result = await llm.main.ainvoke([system, HumanMessage(content=human)])
            issues = result.content if hasattr(result, "content") else str(result)
        except Exception as exc:
            logger.error(f"review_text 失败: {exc}", exc_info=True)
            return {"error": f"检查失败: {exc}"}
        return {"mode": mode, "checked_length": len(content), "issues": issues}

    @tool
    async def create_entities(
        characters: Annotated[list | None, "角色列表，每项 {name, description, role_type?, aliases?, status?, relationship_chain?, locked?}"] = None,
        locations: Annotated[list | None, "地点列表，每项 {name, type, description, parent_id?}"] = None,
        scene_events: Annotated[list | None, "时间线事件列表，每项 {title, content, event_type?, chapter_id?, character_ids?, location_id?, plot_thread_ids?, story_label?, story_ts?}"] = None,
        foreshadowings: Annotated[list | None, "伏笔列表，每项 {description, status?, planted_at_chapter_id?, related_character_ids?, notes?}"] = None,
        plot_threads: Annotated[list | None, "情节线索列表，每项 {name, description, type?, status?, progress_note?}"] = None,
        source_text: Annotated[str | None, "可选：提供原始文本，由模型一次性抽取人物/地点/事件后直接落库（替代逐条传入）"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """批量创建世界观实体（角色/地点/时间线事件/伏笔/情节线索）。可传结构化列表，或提供 source_text 由模型抽取后落库。"""
        logger.debug(f"[tool] create_entities  book_id={book_id}  src_len={len(source_text or '')}")
        if source_text and source_text.strip():
            extracted = await _extract_entities_from_text(model_config, source_text)
            if extracted:
                characters = (characters or []) + (extracted.get("characters") or [])
                locations = (locations or []) + (extracted.get("locations") or [])
                scene_events = (scene_events or []) + (extracted.get("scene_events") or [])
        created_ids: dict = {"characters": [], "locations": [], "scene_events": [], "foreshadowings": [], "plot_threads": []}
        errors: list = []
        async with session_factory() as session:
            repo = WorldRepository(session)
            for c in (characters or []):
                if not isinstance(c, dict) or not c.get("name"):
                    continue
                try:
                    char = Character(
                        user_id=user_id, book_id=book_id, name=c["name"],
                        description=c.get("description", ""), role_type=c.get("role_type"),
                        aliases=c.get("aliases", []), status=c.get("status"),
                        relationship_chain=c.get("relationship_chain", []), locked=bool(c.get("locked", False)),
                    )
                    session.add(char)
                    await session.flush()
                    created_ids["characters"].append(char.id)
                except Exception as exc:
                    errors.append({"kind": "character", "name": c.get("name"), "error": str(exc)})
            for l in (locations or []):
                if not isinstance(l, dict) or not l.get("name"):
                    continue
                try:
                    data = {"name": l["name"], "type": l.get("type", "场所"), "description": l.get("description", "")}
                    if l.get("parent_id") is not None:
                        data["parent_id"] = l["parent_id"]
                    inst = await repo.create_location(book_id, data)
                    created_ids["locations"].append(inst.id)
                except Exception as exc:
                    errors.append({"kind": "location", "name": l.get("name"), "error": str(exc)})
            for ev in (scene_events or []):
                if not isinstance(ev, dict) or not ev.get("title"):
                    continue
                try:
                    data = {"title": ev["title"], "content": ev.get("content", "")}
                    for k in ("event_type", "chapter_id", "character_ids", "location_id", "plot_thread_ids", "story_label", "story_ts"):
                        if ev.get(k) is not None:
                            data[k] = ev[k]
                    inst = await repo.create_scene_event(book_id, data)
                    created_ids["scene_events"].append(inst.id)
                except Exception as exc:
                    errors.append({"kind": "scene_event", "title": ev.get("title"), "error": str(exc)})
            for f in (foreshadowings or []):
                if not isinstance(f, dict) or not f.get("description"):
                    continue
                try:
                    data = {"description": f["description"], "status": normalize_foreshadowing_status(f.get("status")) or "planted"}
                    for k in ("planted_at_chapter_id", "related_character_ids", "notes", "related_event_id"):
                        if f.get(k) is not None:
                            data[k] = f[k]
                    inst = await repo.create_foreshadowing(book_id, data)
                    created_ids["foreshadowings"].append(inst.id)
                except Exception as exc:
                    errors.append({"kind": "foreshadowing", "error": str(exc)})
            for p in (plot_threads or []):
                if not isinstance(p, dict) or not p.get("name"):
                    continue
                try:
                    data = {"name": p["name"], "description": p.get("description", ""), "status": normalize_plot_thread_status(p.get("status")) or "active"}
                    if p.get("type") is not None:
                        data["type"] = p["type"]
                    if p.get("progress_note") is not None:
                        data["progress_note"] = p["progress_note"]
                    inst = await repo.create_plot_thread(book_id, data)
                    created_ids["plot_threads"].append(inst.id)
                except Exception as exc:
                    errors.append({"kind": "plot_thread", "name": p.get("name"), "error": str(exc)})
            await session.commit()
        return {"book_id": book_id, "created_ids": created_ids, "errors": errors}

    UPDATABLE_FIELDS = {
        "foreshadowing": {"description", "status", "planted_at_chapter_id", "resolved_at_chapter_id", "related_character_ids", "notes", "related_event_id"},
        "plot_thread": {"name", "description", "status", "progress_note", "type", "start_chapter_id", "end_chapter_id", "parent_thread_id"},
        "timeline": {"title", "content", "event_type", "chapter_id", "character_ids", "location_id", "plot_thread_ids", "story_label", "story_ts"},
        "chapter": {"title", "summary", "character_ids"},
        "character": {"name", "description", "role_type", "aliases", "status", "relationship_chain", "locked"},
        "location": {"name", "type", "description", "parent_id", "attributes", "locked"},
    }

    @tool
    async def update_entity(
        kind: Annotated[str, "实体类型：foreshadowing/plot_thread/timeline/chapter/character/location"],
        item_id: Annotated[int, "要更新的实体ID"],
        data: Annotated[dict, "要更新的字段字典（仅接受该类型允许的字段，无效字段被忽略）"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """按类型更新世界观实体。字段按类型白名单过滤；chapter 类型在 locked=True 时拒绝。"""
        logger.debug(f"[tool] update_entity  kind={kind}  item_id={item_id}")
        allowed = UPDATABLE_FIELDS.get(kind)
        if allowed is None:
            return {"error": f"不支持的 kind: {kind}"}
        if not isinstance(data, dict):
            return {"error": "data 必须是字典"}
        payload = {k: v for k, v in data.items() if k in allowed}
        if not payload:
            return {"error": "没有可更新的有效字段", "allowed": sorted(allowed)}
        async with session_factory() as session:
            if kind in ("foreshadowing", "plot_thread", "timeline"):
                repo = WorldRepository(session)
                if kind == "foreshadowing":
                    if "status" in payload:
                        payload["status"] = normalize_foreshadowing_status(payload["status"]) or "planted"
                    inst = await repo.update_foreshadowing(item_id, book_id, payload)
                elif kind == "plot_thread":
                    if "status" in payload:
                        payload["status"] = normalize_plot_thread_status(payload["status"]) or "active"
                    inst = await repo.update_plot_thread(item_id, book_id, payload)
                else:
                    inst = await repo.update_scene_event(item_id, book_id, payload)
                if not inst:
                    return {"error": f"{kind} 不存在", "item_id": item_id}
                return {"id": inst.id, "kind": kind, "updated": payload}
            if kind == "chapter":
                inst = (await session.execute(select(Chapter).where(Chapter.id == item_id))).scalar_one_or_none()
                if not inst:
                    return {"error": "章节不存在", "item_id": item_id}
                if inst.locked:
                    return {"error": "章节已锁定，无法更新", "item_id": item_id}
                for k, v in payload.items():
                    setattr(inst, k, v)
                await session.commit()
                return {"id": inst.id, "kind": "chapter", "updated": payload}
            if kind == "location":
                inst = await WorldRepository(session).update_location(item_id, book_id, payload)
                if not inst:
                    return {"error": "地点不存在", "item_id": item_id}
                return {"id": inst.id, "kind": "location", "updated": payload}
            if kind == "character":
                inst = (await session.execute(select(Character).where(Character.id == item_id, Character.book_id == book_id))).scalar_one_or_none()
                if not inst:
                    return {"error": "角色不存在", "item_id": item_id}
                for k, v in payload.items():
                    setattr(inst, k, v)
                await session.commit()
                return {"id": inst.id, "kind": "character", "updated": payload}
            return {"error": f"不支持的 kind: {kind}"}

    @tool
    async def create_outline(
        mode: Annotated[str, "创建类型：volume(卷)/chapter(章节)"],
        title: Annotated[str, "卷或章节的标题"],
        summary: Annotated[str | None, "可选：卷简介或章节摘要（由 Agent 注入）"] = None,
        volume_id: Annotated[int | None, "目标卷ID（mode=chapter 必填）"] = None,
        sort_order: Annotated[int | None, "排序位置，缺省则追加到末尾"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """创建大纲结构：volume 建卷（可带简介），chapter 在指定卷下建章节（可带摘要）。"""
        logger.debug(f"[tool] create_outline  mode={mode}  book_id={book_id}  title={title}")
        if not title or not title.strip():
            return {"error": "title 不能为空"}
        async with session_factory() as session:
            if mode == "volume":
                vols = (await session.execute(select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order.desc()))).scalars().all()
                order = sort_order if sort_order is not None else (vols[0].sort_order + 1 if vols else 1)
                vol = Volume(book_id=book_id, title=title.strip(), summary=summary or "", sort_order=order)
                session.add(vol)
                await session.flush()
                await session.commit()
                return {"kind": "volume", "id": vol.id, "title": vol.title, "summary": vol.summary, "sort_order": vol.sort_order}
            if mode == "chapter":
                if not volume_id:
                    return {"error": "mode=chapter 需要 volume_id"}
                vol = (await session.execute(select(Volume).where(Volume.id == volume_id, Volume.book_id == book_id))).scalar_one_or_none()
                if not vol:
                    return {"error": "卷不存在", "volume_id": volume_id}
                chs = (await session.execute(select(Chapter).where(Chapter.volume_id == volume_id).order_by(Chapter.sort_order.desc()))).scalars().all()
                order = sort_order if sort_order is not None else (chs[0].sort_order + 1 if chs else 1)
                ch = Chapter(volume_id=volume_id, title=title.strip(), summary=summary or "", sort_order=order, locked=False, generation_batch=1)
                session.add(ch)
                await session.flush()
                await session.commit()
                return {"kind": "chapter", "id": ch.id, "volume_id": volume_id, "title": ch.title, "summary": ch.summary, "sort_order": ch.sort_order}
            return {"error": f"不支持的 mode: {mode}"}

    @tool
    async def read_chapter_content(
        chapter_id: Annotated[int, "章节ID"],
        version: Annotated[int | None, "指定版本号，缺省取最新版本"] = None,
        max_chars: Annotated[int, "返回内容的最大字符数"] = 8000,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """读取章节正文内容（缺省最新版本），解决 lookup_outline 的 content 恒为空问题。"""
        logger.debug(f"[tool] read_chapter_content  chapter_id={chapter_id}  book_id={book_id}")
        async with session_factory() as session:
            stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id)
            if version is not None:
                stmt = stmt.where(ChapterContent.version == version)
            stmt = stmt.order_by(ChapterContent.version.desc()).limit(1)
            content = (await session.execute(stmt)).scalar_one_or_none()
            if not content:
                return {"error": "章节无正文内容", "chapter_id": chapter_id}
            text = content.content or ""
            truncated = len(text) > max_chars
            return {
                "chapter_id": chapter_id, "version": content.version,
                "word_count": len(text), "truncated": truncated,
                "content": text[:max_chars] if truncated else text,
            }

    @tool
    async def write_chapter_content(
        chapter_id: Annotated[int, "章节ID"],
        content: Annotated[str, "要写入的正文内容"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """写入章节正文：一律新增一个 ChapterContent 版本（version=最新+1），不覆盖旧版本；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] write_chapter_content  chapter_id={chapter_id}  book_id={book_id}")
        async with session_factory() as session:
            ch = (await session.execute(select(Chapter).where(Chapter.id == chapter_id))).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法写入", "chapter_id": chapter_id}
            max_ver = (await session.execute(func.max(ChapterContent.version).where(ChapterContent.chapter_id == chapter_id))).scalar() or 0
            new_content = ChapterContent(chapter_id=chapter_id, content=content, version=max_ver + 1)
            session.add(new_content)
            await session.commit()
            return {"chapter_id": chapter_id, "version": new_content.version, "word_count": len(content)}

    @tool
    async def search(
        query: Annotated[str, "搜索关键词"],
        mode: Annotated[str, "检索模式：docs(公开文档语义RAG)/web(联网搜索)"] = "docs",
        top_k: Annotated[int, "返回结果数量"] = 5,
        doc_ids: Annotated[list | None, "限定文档ID列表（mode=docs 时），对应 documents.id"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """统一检索入口：mode=docs 语义检索公开文档库，mode=web 联网搜索。"""
        logger.debug(f"[tool] search  mode={mode}  query={query}  book_id={book_id}")
        if mode == "web":
            async with session_factory() as session:
                api_key = (((model_config or {}).get("search_config") or {}).get("api_key") or "")
                if not api_key:
                    return [{"error": "未配置 search_config.api_key", "query": query}]
                service = WebSearchService(session)
                return await service.search(query=query, api_key=api_key, top_k=top_k, use_cache=True)
        async with session_factory() as session:
            vector_repo = VectorRepository(session)
            embedding = None
            if model_config:
                try:
                    llm = ModelFactory(model_config)
                    embedding = await llm.embedding.aembed_query(query)
                except Exception as exc:
                    logger.warning(f"search embedding 失败: {exc}")
            if embedding is None:
                return []
            rag_filter = {"query": query}
            if doc_ids:
                rag_filter["doc_ids"] = [str(d) for d in doc_ids]
            elif book_id:
                rag_filter["book_id"] = book_id
            items = await vector_repo.search_external_books(query_embedding=embedding, rag_filter=rag_filter, top_k=top_k)
            return [
                {
                    "source": "docs",
                    "doc_id": item.get("doc_id"),
                    "doc_title": item.get("doc_title"),
                    "doc_author": item.get("doc_author"),
                    "content": item.get("content"),
                    "score": 1 - float(item.get("distance", 0) or 0),
                }
                for item in items
            ]

    @tool
    async def manage_memory(
        mode: Annotated[str, "操作：save/recall/list/forget/update"],
        content: Annotated[str | None, "记忆内容（save 必填）"] = None,
        memory_type: Annotated[str, "记忆类型：preference/character/plot/world"] = "preference",
        memory_id: Annotated[int | None, "记忆ID（recall 按类型筛选/list 按类型/forget/update 必填）"] = None,
        query: Annotated[str | None, "检索文本（recall 必填）"] = None,
        top_k: Annotated[int, "返回数量"] = 5,
        priority: Annotated[int, "优先级"] = 5,
        meta: Annotated[dict | None, "附加元数据"] = None,
        related_character_ids: Annotated[list | None, "关联角色ID"] = None,
        related_chapter_id: Annotated[int | None, "关联章节ID"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> Any:
        """统一管理 Agent 长期记忆：保存/检索/列出/删除/更新。recall 先语义后全文回退。"""
        logger.debug(f"[tool] manage_memory  mode={mode}  book_id={book_id}")
        effective_book_id = book_id or None
        if mode == "save":
            if not content:
                return {"error": "save 需要 content"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                mem = await svc.save_memory(
                    user_id=user_id, book_id=effective_book_id, memory_type=memory_type,
                    content=content, related_chapter_id=related_chapter_id,
                    related_character_ids=related_character_ids or [], priority=priority,
                    source="agent_self_reflection", meta=meta or {},
                )
                return {"memory_id": mem.id}
        if mode == "recall":
            if not query:
                return {"error": "recall 需要 query"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                results = await svc.search_memories(
                    user_id=user_id, mode="semantic", query=query, book_id=effective_book_id,
                    memory_type=memory_type, top_k=top_k, model_config=model_config,
                )
                if not results:
                    results = await svc.search_memories(
                        user_id=user_id, mode="fulltext", query=query, book_id=effective_book_id,
                        memory_type=memory_type, top_k=top_k, model_config=None,
                    )
                return results
        if mode == "list":
            async with session_factory() as session:
                return await AgentMemoryService(session).list_memories(user_id=user_id, book_id=effective_book_id, memory_type=memory_type)
        if mode == "forget":
            if not memory_id:
                return {"error": "forget 需要 memory_id"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                mem = await svc.get_memory(user_id=user_id, memory_id=memory_id)
                if not mem:
                    return {"ok": False, "detail": "记忆不存在"}
                await svc.delete_memory(user_id=user_id, memory_id=memory_id)
                return {"ok": True}
        if mode == "update":
            if not memory_id:
                return {"error": "update 需要 memory_id"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                payload = {k: v for k, v in {"memory_type": memory_type, "content": content, "priority": priority, "meta": meta}.items() if v is not None}
                mem = await svc.update_memory(user_id=user_id, memory_id=memory_id, data=payload)
                if not mem:
                    return {"ok": False, "detail": "记忆不存在"}
                return {"ok": True, "memory_id": memory_id}
        return {"error": f"不支持的 mode: {mode}"}

    return lookup_tools + [
        get_book_context,
        transform_text,
        review_text,
        create_entities,
        update_entity,
        create_outline,
        read_chapter_content,
        write_chapter_content,
        search,
        manage_memory,
    ]


def build_tools(session_factory, model_config: dict | None = None) -> list:
    """构建并返回全部 Agent 工具列表（供 bind_tools 与 ToolNode 共用）。

    Args:
        session_factory: 数据库会话工厂。
        model_config: 模型配置。

    Returns:
        工具实例列表。
    """
    from .tools.extend_outline_tool import build_extend_outline_tool
    from .tools.feedback_tools import _build_feedback_tools
    from .tools.generate_chapter_tool import build_generate_chapter_tool
    from .tools.workflow_bridge_tools import build_workflow_bridge_tools

    tools = _build_agent_tools(session_factory, model_config=model_config)
    tools.append(build_generate_chapter_tool(session_factory, model_config=model_config))
    tools.extend(build_workflow_bridge_tools(session_factory, model_config=model_config))
    tools.append(build_extend_outline_tool(session_factory, model_config=model_config))
    tools.extend(_build_feedback_tools(session_factory, model_config=model_config).values())
    return tools


def build_tool_node(session_factory, model_config: dict | None = None, extra_tools=None):
    from langgraph.prebuilt import ToolNode

    tools = build_tools(session_factory, model_config=model_config)
    if extra_tools:
        tools.extend(extra_tools)
    logger.debug(f"[tool_node] 注册了 {len(tools)} 个工具")
    return ToolNode(tools)
