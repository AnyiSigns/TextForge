from typing import Annotated, Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from models.book import (
    Book,
    Chapter,
    Character,
    CreativeSetting,
    Foreshadowing,
    Location,
    PlotThread,
    SceneEvent,
    Volume,
)
from shared.utils import redact_sensitive
from sqlalchemy import func, select

from domains.memory.service import AgentMemoryService
from domains.world.constants import (
    normalize_foreshadowing_status,
    normalize_plot_thread_status,
)
from domains.world.derived_sync import recompute_derived, schedule_recompute
from domains.world.repository import WorldRepository

logger = get_logger(__name__)


def _trunc(text: Any, max_len: int) -> str:
    """按列宽截断单字段（超长截断并静默降级，与 extend_outline_tool 同法）。"""
    if text is None:
        return ""
    s = str(text).strip()
    return s if len(s) <= max_len else s[:max_len]


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


def _build_book_tools(session_factory, model_config: dict | None = None):
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
                    errors.append({"kind": "character", "name": c.get("name"), "error": redact_sensitive(str(exc))})
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
                    errors.append({"kind": "location", "name": l.get("name"), "error": redact_sensitive(str(exc))})
            for ev in (scene_events or []):
                if not isinstance(ev, dict) or not ev.get("title"):
                    continue
                try:
                    # 与 build_outline 场景事件字段对齐——正文用 description（兼容 content）
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
                    errors.append({"kind": "scene_event", "title": ev.get("title"), "error": redact_sensitive(str(exc))})
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
                    errors.append({"kind": "foreshadowing", "error": redact_sensitive(str(exc))})
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
                    errors.append({"kind": "plot_thread", "name": p.get("name"), "error": redact_sensitive(str(exc))})
            await session.commit()
            # Agent 直接创建场景事件/伏笔/情节线后，统一异步重算派生字段
            if created_ids["scene_events"] or created_ids["foreshadowings"] or created_ids["plot_threads"]:
                schedule_recompute(book_id)
        return {"book_id": book_id, "created_ids": created_ids, "errors": errors}

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
                return {"error": f"大纲创建失败，已回滚，未写入任何数据: {redact_sensitive(str(exc))}"}
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

    return [
        get_book_context,
        lookup_workflows,
        create_entities,
        update_entity,
        build_outline,
        manage_memory,
    ]
