import re
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
from domains.world.derived_sync import recompute_derived, schedule_recompute
from domains.world.repository import WorldRepository
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

from .web_search_service import WebSearchService

logger = get_logger(__name__)


def _trunc(text: Any, max_len: int) -> str:
    """按列宽截断单字段（超长截断并静默降级，与 extend_outline_tool 同法）。"""
    if text is None:
        return ""
    s = str(text).strip()
    return s if len(s) <= max_len else s[:max_len]


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


def _apply_unified_diff(old_text: str, diff_text: str) -> str:
    """把标准 unified diff 应用到 old_text 上，返回新文本。

    仅解析以 @@ 开头的 hunk；上下文行(' ')、删除行('-')、新增行('+')按规则重建。
    不支持二进制补丁或带 rename 的 diff。hunk 越界或与正文不匹配时抛 ValueError。

    Args:
        old_text: 当前正文。
        diff_text: 标准 unified diff 文本（含 @@ hunk 头）。

    Returns:
        应用 diff 后的新文本。
    """
    old_lines = old_text.split("\n")
    hunks: list[dict] = []
    cur: dict | None = None
    for raw in diff_text.split("\n"):
        if raw.startswith("@@"):
            m = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", raw)
            if not m:
                continue
            cur = {"old_start": int(m.group(1)), "ops": []}
            hunks.append(cur)
        elif cur is not None and raw and raw[0] in ("+", "-", " "):
            cur["ops"].append((raw[0], raw[1:]))
        # 其余行（如 --- / +++ 文件头、空行）忽略
    result = list(old_lines)
    offset = 0
    for h in hunks:
        old_count = sum(1 for k, _ in h["ops"] if k in ("-", " "))
        new_lines = [t for k, t in h["ops"] if k in ("+", " ")]
        base = h["old_start"] - 1 + offset
        if base < 0 or base + old_count > len(result):
            raise ValueError(f"diff 位置越界（hunk 起始行 {h['old_start']}），可能不匹配当前正文")
        result[base:base + old_count] = new_lines
        offset += len(new_lines) - old_count
    return "\n".join(result)


def _normalize_status(value: str | None) -> str | None:
    """兼容中英文状态词：前端 initializerStore 可能写入 '进行中'/'已埋下' 等中文值。"""
    if not value:
        return value
    aliases = {
        "埋下": "planted", "已埋下": "planted", "已回收": "resolved", "已放弃": "abandoned",
        "进行中": "active", "已完成": "completed", "已暂停": "paused", "已中断": "abandoned",
    }
    return aliases.get(value, value)


async def _append_chapter_content_version(
    session, chapter_id: int, content: str
):
    """追加章节内容新版本（version = 最新 + 1），并发撞号时自动重试一次。

    在 (chapter_id, version) 唯一约束下，两个并发写入同时计算 max+1 时，
    后提交的一方会触发 IntegrityError；捕获后回滚并重算版本号重试，
    避免 500 与重复版本。

    Args:
        session: 数据库会话。
        chapter_id: 章节 ID。
        content: 正文内容。

    Returns:
        新创建的 ChapterContent 实例。
    """
    from sqlalchemy.exc import IntegrityError

    for attempt in range(2):
        max_ver = (
            await session.execute(
                select(func.max(ChapterContent.version)).where(
                    ChapterContent.chapter_id == chapter_id
                )
            )
        ).scalar() or 0
        new_content = ChapterContent(
            chapter_id=chapter_id, content=content, version=max_ver + 1
        )
        session.add(new_content)
        try:
            await session.commit()
            return new_content
        except IntegrityError:
            await session.rollback()
            if attempt == 0:
                continue
            raise
    raise RuntimeError("追加章节版本失败")  # pragma: no cover


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
        sections: Annotated[list | None, "裁剪参数：book/characters/volumes/creative_setting 子集，缺省返回全部"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """获取当前书籍的完整上下文：基本信息、创作设定、角色列表与完整大纲树（卷→章→场景事件概要，不含正文）。

        sections 可裁剪返回内容（book/characters/volumes/creative_setting），
        只需要某个子集时传小清单省 token，缺省返回全部。

        Returns:
            包含 book、creative_setting、characters、volumes（含各卷 chapters 及各章 scene_events 概要）的字典。
        """
        logger.debug(f"[tool] get_book_context  book_id={book_id}  sections={sections}")
        want = set(sections or []) or {"book", "characters", "volumes", "creative_setting"}
        async with session_factory() as session:
            book_stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"error": "书籍不存在或无权访问"}
            out: dict = {}
            if "book" in want:
                out["book"] = {
                    "id": book.id, "title": book.title,
                    "description": book.description, "genre": book.genre,
                    "total_word_goal": book.total_word_goal, "current_word_count": book.current_word_count,
                    "workflow_id": book.workflow_id,
                }
            if "creative_setting" in want:
                creative_stmt = select(CreativeSetting).where(CreativeSetting.book_id == book_id)
                creative = (await session.execute(creative_stmt)).scalar_one_or_none()
                out["creative_setting"] = {
                    "tone": creative.tone, "worldview": creative.worldview,
                    "writing_taboos": creative.writing_taboos,
                    "custom_dimensions": creative.custom_dimensions or {},
                } if creative else None
            if "characters" in want:
                char_stmt = select(Character).where(Character.book_id == book_id).order_by(Character.id)
                characters = (await session.execute(char_stmt)).scalars().all()
                out["character_count"] = len(characters)
                out["characters"] = [
                    {"id": c.id, "name": c.name, "role_type": c.role_type, "description": c.description}
                    for c in characters
                ]
            if "volumes" in want:
                vol_stmt = select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
                volumes = (await session.execute(vol_stmt)).scalars().all()
                volumes_out = []
                for v in volumes:
                    ch_stmt = (
                        select(Chapter)
                        .where(Chapter.volume_id == v.id)
                        .order_by(Chapter.sort_order, Chapter.id)
                    )
                    chapters = (await session.execute(ch_stmt)).scalars().all()
                    chapters_out = []
                    for ch in chapters:
                        ev_stmt = (
                            select(SceneEvent)
                            .where(SceneEvent.chapter_id == ch.id)
                            .order_by(SceneEvent.sort_order, SceneEvent.id)
                        )
                        events = (await session.execute(ev_stmt)).scalars().all()
                        chapters_out.append(
                            {
                                "id": ch.id,
                                "title": ch.title,
                                "summary": ch.summary,
                                "sort_order": ch.sort_order,
                                "generation_batch": ch.generation_batch,
                                "character_ids": ch.character_ids,
                                # 上下文保护：每章最多返回 20 个场景事件概要，避免护栏上限
                                # （50 章 × 200 事件）下全量返回撑爆模型上下文
                                "scene_events": [
                                    {
                                        "id": ev.id,
                                        "title": ev.title,
                                        "content": (ev.content or "")[:200],
                                        "event_type": ev.event_type,
                                        "story_label": ev.story_label,
                                        "story_ts": ev.story_ts,
                                        "location_id": ev.location_id,
                                        "character_ids": ev.character_ids or [],
                                        "plot_thread_ids": ev.plot_thread_ids or [],
                                        "completed_plot_thread_ids": ev.completed_plot_thread_ids or [],
                                        "resolved_foreshadowing_ids": ev.resolved_foreshadowing_ids or [],
                                    }
                                    for ev in events[:20]
                                ],
                                "scene_event_total": len(events),
                            }
                        )
                    volumes_out.append(
                        {
                            "id": v.id,
                            "title": v.title,
                            "summary": v.summary,
                            "sort_order": v.sort_order,
                            "chapters": chapters_out,
                        }
                    )
                out["volume_count"] = len(volumes)
                out["volumes"] = volumes_out
            return out

    @tool
    async def lookup_workflows(
        user_id: Annotated[int, InjectedState("user_id")] = 0,
    ) -> dict:
        """查看当前用户可用的工作流列表（含内置模板）。

        用户要求"按某工作流执行"但未给出工作流 ID 时，先调用本工具
        查得 ID 与名称，再调用 execute_workflow。

        Returns:
            工作流列表：id / name / description / builtin / node_count。
        """
        logger.debug(f"[tool] lookup_workflows  user_id={user_id}")
        from models.workflow import Workflow

        async with session_factory() as session:
            stmt = select(Workflow).where(
                (Workflow.user_id == user_id) | (Workflow.builtin == True)
            ).order_by(Workflow.builtin.desc(), Workflow.id)
            workflows = (await session.execute(stmt)).scalars().all()
            return {
                "workflows": [
                    {
                        "id": w.id,
                        "name": w.name,
                        "description": w.description or "",
                        "builtin": bool(w.builtin),
                        "node_count": len(w.nodes or []),
                    }
                    for w in workflows
                ]
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
            from shared.utils import redact_sensitive

            return {"error": f"加工失败: {redact_sensitive(str(exc))}"}
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
            from shared.utils import redact_sensitive

            return {"error": f"检查失败: {redact_sensitive(str(exc))}"}
        return {"mode": mode, "checked_length": len(content), "issues": issues}

    @tool
    async def create_entities(
        characters: Annotated[list | None, "角色列表，每项 {name, description, role_type?, aliases?, status?, relationship_chain?, locked?}"] = None,
        locations: Annotated[list | None, "地点列表，每项 {name, type, description, parent_id?}"] = None,
        scene_events: Annotated[list | None, "时间线事件列表，每项 {title, description(或 content), event_type?, chapter_id?, character_ids?, location_id?, plot_thread_ids?, completed_plot_thread_ids?, resolved_foreshadowing_ids?, story_label?, story_ts?}"] = None,
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
                    # 任务 18：与 build_outline 场景事件字段对齐——正文用 description（兼容 content）
                    data = {
                        "title": ev["title"],
                        "content": ev.get("description") or ev.get("content") or "",
                    }
                    for k in (
                        "event_type", "chapter_id", "character_ids", "location_id",
                        "plot_thread_ids", "completed_plot_thread_ids",
                        "resolved_foreshadowing_ids", "story_label", "story_ts",
                    ):
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
            # Agent 直接创建场景事件/伏笔/情节线后，统一异步重算派生字段
            if created_ids["scene_events"] or created_ids["foreshadowings"] or created_ids["plot_threads"]:
                schedule_recompute(book_id)
        return {"book_id": book_id, "created_ids": created_ids, "errors": errors}

    UPDATABLE_FIELDS = {
        "foreshadowing": {"description", "status", "planted_at_chapter_id", "resolved_at_chapter_id", "related_character_ids", "notes", "related_event_id"},
        "plot_thread": {"name", "description", "status", "progress_note", "type", "start_chapter_id", "end_chapter_id", "parent_thread_id"},
        "timeline": {"title", "content", "event_type", "chapter_id", "character_ids", "location_id", "plot_thread_ids", "story_label", "story_ts"},
        "chapter": {"title", "summary", "character_ids"},
        "character": {"name", "description", "role_type", "aliases", "status", "relationship_chain", "locked"},
        "location": {"name", "type", "description", "parent_id", "attributes", "locked"},
        "book": {"title", "description", "genre", "total_word_goal"},
        "volume": {"title", "summary"},
        "creative_setting": {"tone", "worldview", "writing_taboos", "custom_dimensions"},
    }

    @tool
    async def update_entity(
        kind: Annotated[str, "实体类型：foreshadowing/plot_thread/timeline/chapter/character/location/book/volume/creative_setting"],
        item_id: Annotated[int, "要更新的实体ID"],
        data: Annotated[dict, "要更新的字段字典（仅接受该类型允许的字段，无效字段被忽略）"],
        user_id: Annotated[int, InjectedState("user_id")] = 0,
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
                # Agent 更新场景事件/伏笔/情节线后，统一异步重算派生字段
                schedule_recompute(book_id)
                return {"id": inst.id, "kind": kind, "updated": payload}
            if kind == "chapter":
                # 校验章节归属当前书籍：仅按 id 查询会允许越权更新他人书籍的章节
                inst = (
                    await session.execute(
                        select(Chapter)
                        .join(Volume, Chapter.volume_id == Volume.id)
                        .where(Chapter.id == item_id, Volume.book_id == book_id)
                    )
                ).scalar_one_or_none()
                if not inst:
                    return {"error": "章节不存在或不属于当前书籍", "item_id": item_id}
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
            if kind == "book":
                inst = (await session.execute(select(Book).where(Book.id == item_id, Book.user_id == user_id))).scalar_one_or_none()
                if not inst:
                    return {"error": "书籍不存在或无权访问", "item_id": item_id}
                for k, v in payload.items():
                    setattr(inst, k, v)
                await session.commit()
                return {"id": inst.id, "kind": "book", "updated": payload}
            if kind == "volume":
                inst = (await session.execute(select(Volume).where(Volume.id == item_id, Volume.book_id == book_id))).scalar_one_or_none()
                if not inst:
                    return {"error": "卷不存在或不属于当前书籍", "item_id": item_id}
                for k, v in payload.items():
                    setattr(inst, k, v)
                await session.commit()
                return {"id": inst.id, "kind": "volume", "updated": payload}
            if kind == "creative_setting":
                inst = (await session.execute(select(CreativeSetting).where(CreativeSetting.book_id == book_id))).scalar_one_or_none()
                if not inst:
                    inst = CreativeSetting(book_id=book_id)
                    session.add(inst)
                for k, v in payload.items():
                    setattr(inst, k, v)
                await session.commit()
                return {"id": inst.id, "kind": "creative_setting", "updated": payload}
            return {"error": f"不支持的 kind: {kind}"}

    @tool
    async def build_outline(
        volumes: Annotated[list, "大纲结构：卷列表。每卷 {title, summary?, chapters?:[{title, summary?, scene_events?:[{title, event_type?, description?, location_id?, location_name?, location_type?, story_label?, story_ts?, character_ids?, character_names?, plot_thread_ids?, plot_thread_names?, completed_plot_thread_ids?, completed_plot_thread_names?, resolved_foreshadowing_ids?, resolved_foreshadowing_titles?}]}]}"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """一次性创建完整书籍大纲：多卷 × 多章 × 多场景事件，单事务落库。

        场景事件支持按名称引用已有角色/地点/情节线/伏笔（数字 ID 优先于名称）；
        地点名未命中自动新建（缺省类型"未分类"）；角色/情节线/伏笔未命中跳过并写入 warnings。
        数量护栏：卷≤5、章≤50、场景事件≤200，超限直接拒绝并提示分次创建。
        伏笔无 title 字段，resolved_foreshadowing_titles 按伏笔描述子串匹配。
        """
        logger.debug(f"[tool] build_outline  book_id={book_id}  volumes={len(volumes) if isinstance(volumes, list) else 'invalid'}")
        if not isinstance(volumes, list) or not volumes:
            return {"error": "volumes 不能为空，请提供至少一卷"}
        if not all(isinstance(v, dict) for v in volumes):
            return {"error": "volumes 每项必须是对象 {title, chapters?}"}
        total_chapters = sum(len(v.get("chapters") or []) for v in volumes if isinstance(v, dict))
        total_events = sum(
            len(ch.get("scene_events") or [])
            for v in volumes if isinstance(v, dict)
            for ch in (v.get("chapters") or []) if isinstance(ch, dict)
        )
        if len(volumes) > 5:
            return {"error": f"卷数量 {len(volumes)} 超过护栏上限（≤5），请分次创建：先建前几卷，确认后再继续。", "guardrail": "volumes<=5"}
        if total_chapters > 50:
            return {"error": f"章节总数 {total_chapters} 超过护栏上限（≤50），请分次创建。", "guardrail": "chapters<=50"}
        if total_events > 200:
            return {"error": f"场景事件总数 {total_events} 超过护栏上限（≤200），请分次创建。", "guardrail": "scene_events<=200"}
        warnings: list = []
        volume_ids: list = []
        chapter_ids: list = []
        event_ids: list = []
        volumes_created = chapters_created = events_created = new_locations = 0
        async with session_factory() as session:
            chars = {
                c.name: c.id
                for c in (await session.execute(select(Character).where(Character.book_id == book_id))).scalars().all()
            }
            char_id_set = set(chars.values())
            locs = {
                l.name: l.id
                for l in (await session.execute(select(Location).where(Location.book_id == book_id))).scalars().all()
            }
            threads = {
                t.name: t.id
                for t in (await session.execute(select(PlotThread).where(PlotThread.book_id == book_id))).scalars().all()
            }
            thread_id_set = set(threads.values())
            foreshadowings = (await session.execute(select(Foreshadowing).where(Foreshadowing.book_id == book_id))).scalars().all()
            foreshadowing_by_id = {f.id: f for f in foreshadowings}
            max_ts_raw = (await session.execute(select(func.max(SceneEvent.story_ts)).where(SceneEvent.book_id == book_id))).scalar()
            base_ts = float(max_ts_raw) if isinstance(max_ts_raw, (int, float)) else 0.0
            last_vol_order_raw = (await session.execute(select(func.max(Volume.sort_order)).where(Volume.book_id == book_id))).scalar()
            last_vol_order = int(last_vol_order_raw) if isinstance(last_vol_order_raw, (int, float)) else 0
            created_location_names: dict = {}
            try:
                for vi, v in enumerate(volumes):
                    if not isinstance(v, dict):
                        warnings.append(f"第 {vi + 1} 卷格式无效，已跳过")
                        continue
                    v_title = _trunc(v.get("title"), 100)
                    if not v_title:
                        warnings.append(f"第 {vi + 1} 卷 title 为空，已跳过")
                        continue
                    vol = Volume(
                        book_id=book_id,
                        title=v_title,
                        summary=_trunc(v.get("summary"), 500),
                        sort_order=int(last_vol_order or 0) + vi + 1,
                    )
                    session.add(vol)
                    await session.flush()
                    volume_ids.append(vol.id)
                    volumes_created += 1
                    for ci, ch in enumerate(v.get("chapters") or []):
                        if not isinstance(ch, dict):
                            warnings.append(f"卷「{v_title}」第 {ci + 1} 章格式无效，已跳过")
                            continue
                        ch_title = _trunc(ch.get("title"), 200)
                        if not ch_title:
                            warnings.append(f"卷「{v_title}」存在 title 为空的章节，已跳过")
                            continue
                        last_ch_order_raw = (await session.execute(select(func.max(Chapter.sort_order)).where(Chapter.volume_id == vol.id))).scalar()
                        last_ch_order = int(last_ch_order_raw) if isinstance(last_ch_order_raw, (int, float)) else 0
                        chapter = Chapter(
                            volume_id=vol.id,
                            title=ch_title,
                            summary=_trunc(ch.get("summary"), 500),
                            sort_order=last_ch_order + 1,
                            locked=False,
                            generation_batch=1,
                        )
                        session.add(chapter)
                        await session.flush()
                        chapter_ids.append(chapter.id)
                        chapters_created += 1
                        for si, ev in enumerate(ch.get("scene_events") or []):
                            if not isinstance(ev, dict):
                                warnings.append(f"章节「{ch_title}」存在格式无效的场景事件，已跳过")
                                continue
                            ev_title = _trunc(ev.get("title"), 200)
                            if not ev_title:
                                warnings.append(f"章节「{ch_title}」存在 title 为空的场景事件，已跳过")
                                continue
                            location_id = None
                            loc_id = ev.get("location_id")
                            if isinstance(loc_id, int) and loc_id:
                                valid = (await session.execute(select(Location.id).where(Location.id == loc_id, Location.book_id == book_id))).scalar_one_or_none()
                                if valid:
                                    location_id = loc_id
                                else:
                                    warnings.append(f"场景「{ev_title[:50]}」的 location_id={loc_id} 不属于当前书籍，已忽略")
                            if location_id is None:
                                loc_name = _trunc(ev.get("location_name"), 200)
                                if loc_name:
                                    if loc_name in created_location_names:
                                        location_id = created_location_names[loc_name]
                                    elif loc_name in locs:
                                        location_id = locs[loc_name]
                                    else:
                                        new_loc = Location(
                                            book_id=book_id,
                                            name=loc_name,
                                            type=_trunc(ev.get("location_type"), 50) or "未分类",
                                            description="",
                                            locked=False,
                                        )
                                        session.add(new_loc)
                                        await session.flush()
                                        location_id = new_loc.id
                                        locs[loc_name] = location_id
                                        created_location_names[loc_name] = location_id
                                        new_locations += 1
                            resolved_char_ids: list = []
                            for cid in (ev.get("character_ids") or []):
                                if isinstance(cid, int) and cid in char_id_set and cid not in resolved_char_ids:
                                    resolved_char_ids.append(cid)
                            for cname in (ev.get("character_names") or []):
                                if cname in chars and chars[cname] not in resolved_char_ids:
                                    resolved_char_ids.append(chars[cname])
                                elif cname not in chars:
                                    warnings.append(f"场景「{ev_title[:50]}」未找到角色「{cname}」，已跳过（可用 create_entities 或 lookup_characters 确认）")
                            resolved_thread_ids: list = []
                            for tid in (ev.get("plot_thread_ids") or []):
                                if isinstance(tid, int) and tid in thread_id_set and tid not in resolved_thread_ids:
                                    resolved_thread_ids.append(tid)
                            for tname in (ev.get("plot_thread_names") or []):
                                if tname in threads and threads[tname] not in resolved_thread_ids:
                                    resolved_thread_ids.append(threads[tname])
                                elif tname not in threads:
                                    warnings.append(f"场景「{ev_title[:50]}」未找到情节线「{tname}」，已跳过（可用 lookup_plot_threads 确认）")
                            completed_thread_ids: list = []
                            for tid in (ev.get("completed_plot_thread_ids") or []):
                                if isinstance(tid, int) and tid in thread_id_set and tid not in completed_thread_ids:
                                    completed_thread_ids.append(tid)
                            for tname in (ev.get("completed_plot_thread_names") or []):
                                if tname in threads and threads[tname] not in completed_thread_ids:
                                    completed_thread_ids.append(threads[tname])
                                elif tname not in threads:
                                    warnings.append(f"场景「{ev_title[:50]}」未找到待完结情节线「{tname}」，已跳过（可用 lookup_plot_threads 确认）")
                            resolved_foreshadowing_ids: list = []
                            for fid in (ev.get("resolved_foreshadowing_ids") or []):
                                if isinstance(fid, int) and fid in foreshadowing_by_id and fid not in resolved_foreshadowing_ids:
                                    resolved_foreshadowing_ids.append(fid)
                            for fdesc in (ev.get("resolved_foreshadowing_titles") or []):
                                fdesc = _trunc(fdesc, 200)
                                if not fdesc:
                                    continue
                                match = next(
                                    (f.id for f in foreshadowings if fdesc in (f.description or "")),
                                    None,
                                )
                                if match is not None and match not in resolved_foreshadowing_ids:
                                    resolved_foreshadowing_ids.append(match)
                                else:
                                    warnings.append(f"场景「{ev_title[:50]}」未找到伏笔「{fdesc[:50]}」（按描述匹配，可用 lookup_foreshadowing 确认）")
                            ts = ev.get("story_ts")
                            if isinstance(ts, (int, float)):
                                ts = float(ts)
                            else:
                                base_ts += 1
                                ts = base_ts
                            event = SceneEvent(
                                book_id=book_id,
                                chapter_id=chapter.id,
                                title=ev_title,
                                content=_trunc(ev.get("description"), 500),
                                event_type=_trunc(ev.get("event_type"), 50) or "scene",
                                story_ts=ts,
                                story_label=_trunc(ev.get("story_label"), 200) or None,
                                location_id=location_id,
                                character_ids=resolved_char_ids,
                                plot_thread_ids=resolved_thread_ids,
                                completed_plot_thread_ids=completed_thread_ids,
                                resolved_foreshadowing_ids=resolved_foreshadowing_ids,
                                sort_order=si + 1,
                            )
                            session.add(event)
                            await session.flush()
                            event_ids.append(event.id)
                            events_created += 1
                await session.commit()
            except Exception as exc:
                await session.rollback()
                logger.error(f"build_outline 事务失败，已回滚: {exc}", exc_info=True)
                return {"error": f"大纲创建失败，已回滚，未写入任何数据: {exc}"}
            try:
                await recompute_derived(session, book_id)
            except Exception as exc:
                logger.warning(f"build_outline 派生重算失败（已落库数据不回滚）: {exc}")
        return {
            "book_id": book_id,
            "volumes_created": volumes_created,
            "chapters_created": chapters_created,
            "events_created": events_created,
            "locations_created": new_locations,
            "volume_ids": volume_ids,
            "chapter_ids": chapter_ids,
            "event_ids": event_ids,
            "warnings": warnings,
        }

    @tool
    async def read_chapter_content(
        chapter_id: Annotated[int | None, "章节ID（与 chapter_ids 二选一）"] = None,
        chapter_ids: Annotated[list | None, "批量读取的章节ID列表（与 chapter_id 二选一，drafting 并行读多章时用）"] = None,
        version: Annotated[int | None, "指定版本号，缺省取最新版本"] = None,
        max_chars: Annotated[int, "返回内容的最大字符数"] = 8000,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """读取章节正文内容（缺省最新版本）。传 chapter_ids 时批量读取多章，返回 {chapters: [...]}。

        归属校验：正文必须属于当前 active_book_id 的卷下，跨书章节一律返回「暂无正文」
        （不泄露存在性），防止批量参数被用来枚举其他书籍的章节正文。
        """
        logger.debug(f"[tool] read_chapter_content  chapter_id={chapter_id}  chapter_ids={chapter_ids}  book_id={book_id}")
        ids = list(chapter_ids or []) if chapter_ids else ([chapter_id] if chapter_id else [])
        if not ids:
            return {"error": "请传入 chapter_id 或 chapter_ids"}

        def _format(content: ChapterContent | None, cid: int) -> dict:
            if content is None:
                # 无正文（或不属于当前书）时返回正常结构而非 error，避免被 quality_gate
                # 计为工具失败、诱发模型无谓的空转重试；Agent 据此应改用 write_chapter_content 落库。
                return {
                    "chapter_id": cid, "version": 0,
                    "word_count": 0, "truncated": False,
                    "content": "", "note": "该章节暂无正文（工作流生成的内容尚未落库），如需要保存请调用 write_chapter_content 写入。",
                }
            text = content.content or ""
            truncated = len(text) > max_chars
            return {
                "chapter_id": cid, "version": content.version,
                "word_count": len(text), "truncated": truncated,
                "content": text[:max_chars] if truncated else text,
            }

        async with session_factory() as session:
            if len(ids) == 1:
                stmt = (
                    select(ChapterContent)
                    .join(Chapter, Chapter.id == ChapterContent.chapter_id)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(ChapterContent.chapter_id == ids[0], Volume.book_id == book_id)
                )
                if version is not None:
                    stmt = stmt.where(ChapterContent.version == version)
                stmt = stmt.order_by(ChapterContent.version.desc()).limit(1)
                content = (await session.execute(stmt)).scalar_one_or_none()
                return _format(content, ids[0])
            # 批量：单条 IN 查询 + Postgres DISTINCT ON 只取各章最新版本一次
            # （不把所有历史版本整行取回再丢弃，避免版本越改越多时传输/ORM 成本线性上涨），
            # 且尊重 version 参数（缺省取最新，指定则取该版本）。
            stmt = (
                select(ChapterContent)
                .join(Chapter, Chapter.id == ChapterContent.chapter_id)
                .join(Volume, Volume.id == Chapter.volume_id)
                .where(ChapterContent.chapter_id.in_(ids), Volume.book_id == book_id)
                .distinct(ChapterContent.chapter_id)
                .order_by(
                    ChapterContent.chapter_id,
                    ChapterContent.version.desc(),
                )
            )
            if version is not None:
                stmt = stmt.where(ChapterContent.version == version)
            rows = (await session.execute(stmt)).scalars().all()
            latest: dict[int, ChapterContent] = {}
            for content in rows:
                if content.chapter_id not in latest:
                    latest[content.chapter_id] = content
            return {
                "chapters": [
                    _format(latest.get(cid), cid)
                    for cid in ids
                ]
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
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法写入", "chapter_id": chapter_id}
            new_content = await _append_chapter_content_version(
                session, chapter_id, content
            )
            return {"chapter_id": chapter_id, "version": new_content.version, "word_count": len(content)}

    @tool
    async def write_workflow_candidate(
        chapter_id: Annotated[int, "目标章节 ID"],
        node_id: Annotated[str, "候选节点 ID，从工作流执行结果的 content_nodes 中选取（如 writer/polish）"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        workflow_result: Annotated[dict | None, InjectedState("workflow_result")] = None,
        workflow_node_outputs: Annotated[dict | None, InjectedState("workflow_node_outputs")] = None,
    ) -> dict:
        """把工作流候选正文节点（content_nodes）的完整输出写入章节（落库）。

        工作流执行完成后，Agent 只需把用户选定的节点 ID 传给本工具，
        工具会直接从工作流执行结果中取出该节点的完整正文写入章节（新增版本，不覆盖），
        无需在对话上下文中传输整篇正文，避免 token 损耗。

        Args:
            chapter_id: 目标章节 ID。
            node_id: 用户选定节点的 node_id（从候选列表中的 node_id 字段选择）。
            workflow_result: 工作流执行结果（InjectedState 自动注入），含 content_nodes。
            workflow_node_outputs: 工作流各节点完整输出（跨回合持久化），fallback 数据源。
        """
        logger.debug(f"[tool] write_workflow_candidate  chapter_id={chapter_id}  node_id={node_id}  book_id={book_id}")
        nodes = (workflow_result or {}).get("content_nodes") or []
        node = next((n for n in nodes if n.get("node_id") == node_id), None)
        content = (node or {}).get("output", "") if node else ""
        node_label = (node or {}).get("node_label") or node_id
        # workflow_result 可能在新回合被重置，fallback 到跨回合持久化的 workflow_node_outputs
        if not content:
            persisted = (workflow_node_outputs or {}).get(node_id) or {}
            content = persisted.get("output", "") or ""
            node_label = persisted.get("label") or node_label
        if not node and not content:
            return {
                "error": f"候选节点 {node_id} 不存在，可用的候选节点：{', '.join(n.get('node_id', '') for n in nodes) or '无'}",
                "chapter_id": chapter_id,
            }
        if not content or not content.strip():
            return {"error": f"候选节点 {node_id} 输出为空，无法写入", "chapter_id": chapter_id}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法写入", "chapter_id": chapter_id}
            new_content = await _append_chapter_content_version(
                session, chapter_id, content
            )
            return {
                "chapter_id": chapter_id,
                "node_id": node_id,
                "version": new_content.version,
                "word_count": len(content),
            }

    @tool
    async def edit_chapter_content(
        chapter_id: Annotated[int, "章节ID"],
        old_text: Annotated[str, "要被替换的原文片段，必须精确匹配当前最新正文中的内容（建议先 read_chapter_content 再编辑）"],
        new_text: Annotated[str, "替换后的新文本"],
        all_occurrences: Annotated[bool, "是否替换全部命中：True=替换所有命中；False=仅替换第一处"] = False,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """精确修改章节正文：在最新版本正文中把 old_text 替换为 new_text，仍新增一个版本（不覆盖旧版本）；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] edit_chapter_content  chapter_id={chapter_id}  book_id={book_id}")
        if not old_text:
            return {"error": "old_text 不能为空"}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法修改", "chapter_id": chapter_id}
            max_ver = (await session.execute(select(func.max(ChapterContent.version)).where(ChapterContent.chapter_id == chapter_id))).scalar() or 0
            content_row = (await session.execute(
                select(ChapterContent).where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == max_ver)
            )).scalar_one_or_none()
            current = content_row.content or "" if content_row else ""
            if old_text not in current:
                return {"error": "未找到匹配的 old_text，请先用 read_chapter_content 读取最新正文后重试", "matched": 0}
            count = current.count(old_text)
            if all_occurrences:
                replaced = current.replace(old_text, new_text)
            else:
                replaced = current.replace(old_text, new_text, 1)
            new_content = await _append_chapter_content_version(
                session, chapter_id, replaced
            )
            return {
                "chapter_id": chapter_id, "version": new_content.version,
                "matched": count, "replaced_all": bool(all_occurrences),
                "word_count": len(replaced), "preview": replaced[:200],
            }

    @tool
    async def apply_chapter_diff(
        chapter_id: Annotated[int, "章节ID"],
        unified_diff: Annotated[str, "标准 unified diff 文本（含 @@ hunk 头），对最新正文做局部修改"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """用 unified diff 局部修改章节正文：解析 @@ hunk 并应用到最新版本，仍新增一个版本（不覆盖旧版本）；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] apply_chapter_diff  chapter_id={chapter_id}  book_id={book_id}")
        if not unified_diff or not unified_diff.strip():
            return {"error": "unified_diff 不能为空"}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法修改", "chapter_id": chapter_id}
            max_ver = (await session.execute(select(func.max(ChapterContent.version)).where(ChapterContent.chapter_id == chapter_id))).scalar() or 0
            content_row = (await session.execute(
                select(ChapterContent).where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == max_ver)
            )).scalar_one_or_none()
            current = content_row.content or "" if content_row else ""
            try:
                new_text = _apply_unified_diff(current, unified_diff)
            except ValueError as exc:
                return {"error": f"diff 应用失败: {exc}", "version": max_ver}
            if new_text == current:
                return {"error": "diff 未产生任何改动，请检查 hunk 是否匹配当前正文", "version": max_ver}
            new_content = await _append_chapter_content_version(
                session, chapter_id, new_text
            )
            return {
                "chapter_id": chapter_id, "version": new_content.version,
                "word_count": len(new_text), "preview": new_text[:200],
            }

    @tool
    async def search(
        query: Annotated[str, "搜索关键词"],
        mode: Annotated[str, "检索模式：docs(公开文档语义RAG)/web(联网搜索)"] = "docs",
        top_k: Annotated[int, "返回结果数量"] = 5,
        doc_ids: Annotated[list | None, "限定文档ID列表（mode=docs 时），对应 documents.id"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """统一检索入口：mode=docs 语义检索公开文档库（全库公开文档，文档无书籍归属概念），mode=web 联网搜索。"""
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
            # 注意：文档库为全局公开库（Document 无 book_id 列，检索范围不受当前书籍影响），
            # 如需限定范围请使用 doc_ids。
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
        memory_type: Annotated[str, "记忆类型：character/plot/world/note（创作偏好等非角色/情节/世界设定类用 note 并可在 meta.kind 标注）"] = "note",
        title: Annotated[str | None, "记忆标题（save 可选，便于列表阅读）"] = None,
        memory_id: Annotated[int | None, "记忆ID（recall 按类型筛选/list 按类型/forget/update 必填）"] = None,
        query: Annotated[str | None, "检索文本（recall 必填）"] = None,
        top_k: Annotated[int, "返回数量"] = 5,
        priority: Annotated[int, "优先级"] = 5,
        meta: Annotated[dict | None, "附加元数据"] = None,
        source: Annotated[str | None, "来源过滤（recall/list 可选）：agent_self_reflection/user_manual/manual/context_summary 等，缺省不过滤"] = None,
        related_character_ids: Annotated[list | None, "关联角色ID"] = None,
        related_chapter_id: Annotated[int | None, "关联章节ID"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> Any:
        """统一管理 Agent 长期记忆：保存/检索/列出/删除/更新。recall 先语义后全文回退。

        记忆类型四类：character（角色）/plot（情节）/world（世界）/note（笔记与创作偏好）。
        context_summary 为系统内部类（压缩摘要），普通 recall 一般无需指定。
        """
        logger.debug(f"[tool] manage_memory  mode={mode}  book_id={book_id}")
        effective_book_id = book_id or None
        if mode == "save":
            if not content:
                return {"error": "save 需要 content"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                mem = await svc.save_memory(
                    user_id=user_id, book_id=effective_book_id, memory_type=memory_type,
                    content=content, title=title, related_chapter_id=related_chapter_id,
                    related_character_ids=related_character_ids or [], priority=priority,
                    source="agent_self_reflection", meta=meta or {},
                    model_config=model_config,
                )
                return {"memory_id": mem.id}
        if mode == "recall":
            if not query:
                return {"error": "recall 需要 query"}
            async with session_factory() as session:
                svc = AgentMemoryService(session)
                results = await svc.search_memories(
                    user_id=user_id, mode="semantic", query=query, book_id=effective_book_id,
                    memory_type=memory_type, top_k=top_k, model_config=model_config, source=source,
                )
                if not results:
                    results = await svc.search_memories(
                        user_id=user_id, mode="fulltext", query=query, book_id=effective_book_id,
                        memory_type=memory_type, top_k=top_k, model_config=None, source=source,
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
                if content:
                    try:
                        from core.model_factory import ModelFactory

                        payload["embedding"] = await ModelFactory(model_config or {}).embedding.aembed_query(content[:2000])
                    except Exception:
                        # 生成失败时不清空已有 embedding（避免覆盖为 NULL 导致语义检索丢失旧向量）
                        pass
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
        build_outline,
        read_chapter_content,
        write_chapter_content,
        write_workflow_candidate,
        edit_chapter_content,
        apply_chapter_diff,
        search,
        manage_memory,
        lookup_workflows,
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
