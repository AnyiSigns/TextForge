"""剧情流 — 业务服务层。

负责：会话创建/推进/结束、锚点事件快照与容错、两段式流式生成解析、
决策链历史截断、节点元数据派生、摘要生成与回退、幂等与并发兜底。
"""
import json
from collections.abc import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.model_factory import ModelFactory
from models.book import (
    Book,
    Chapter,
    Character,
    CreativeSetting,
    Foreshadowing,
    Location,
    PlotThread,
    SceneEvent,
)
from models.story_flow import StoryFlow, StoryFlowNode

from . import repository as repo
from .prompts import (
    build_scene_prompt,
    build_summary_prompt,
    fallback_summary_from_nodes,
)

logger = get_logger(__name__)

DEFAULT_OPTIONS = [{"text": "继续剧情"}]
MARKER = "###OPTIONS###"
MORE_MARKER = "###MORE###"
HISTORY_WINDOW = 6
MAX_SCENES_PER_EVENT = 3


async def _make_llm(model_config: dict):
    """构建 main 档 LLM 实例（配置失败时回退默认）。"""
    try:
        factory = ModelFactory(model_config)
        return factory.main
    except Exception as exc:
        logger.warning(f"story_flow 模型初始化失败，使用默认配置: {exc}")
        return ModelFactory({}).main


async def _astream_text(llm, messages: list) -> AsyncGenerator[str, None]:
    """流式迭代 LLM 输出文本片段，流式接口不可用时回退一次性生成。"""
    try:
        async for chunk in llm.astream(messages):
            piece = chunk.content if hasattr(chunk, "content") else str(chunk)
            if piece:
                yield piece
    except Exception:
        logger.warning("[story_flow] LLM 流式接口不可用，回退一次性生成", exc_info=True)
        raw = await llm.ainvoke(messages)
        text = raw.content if hasattr(raw, "content") else str(raw)
        if text:
            yield text


def _parse_options(tail: str) -> list[dict]:
    """解析分隔符之后的 JSON 选项数组（容错，参照 sim_rooms 的 removeprefix 模式）。

    Args:
        tail: 分隔符之后的剩余文本。

    Returns:
        选项数组；LLM 显式返回空数组时保持空（前端视为自然结束）；
        解析失败时回退为默认「继续剧情」。
    """
    cleaned = tail.strip()
    if cleaned:
        cleaned = cleaned.removeprefix("```json").removesuffix("```").strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            items = [
                {"text": str(i.get("text", "")).strip()[:120]}
                for i in parsed
                if isinstance(i, dict) and str(i.get("text", "")).strip()
            ]
            return items
    except Exception:
        logger.debug(f"[story_flow] 选项 JSON 直接解析失败，尝试提取数组: {tail[:60]}")
    # 分隔符之后可能夹带了叙述文字：尝试提取最外层 [...] 数组
    start = tail.find("[")
    end = tail.rfind("]")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(tail[start : end + 1])
            if isinstance(parsed, list):
                items = [
                    {"text": str(i.get("text", "")).strip()[:120]}
                    for i in parsed
                    if isinstance(i, dict) and str(i.get("text", "")).strip()
                ]
                return items
        except Exception:
            logger.debug(f"[story_flow] 提取数组解析失败: {tail[start : end + 1][:60]}")
    return list(DEFAULT_OPTIONS)


def _split_two_phase(full_text: str) -> tuple[str, list[dict]]:
    """把 LLM 完整输出拆为（叙事原文, 选项数组）。

    无分隔符时整个输出视为叙事文本，选项回退为默认「继续剧情」。

    Args:
        full_text: LLM 完整输出。

    Returns:
        (叙事文本, 选项列表)。
    """
    idx = full_text.find(MARKER)
    if idx < 0:
        return full_text.strip() or "（本幕叙事为空）", list(DEFAULT_OPTIONS)
    narration = full_text[:idx].strip() or "（本幕叙事为空）"
    options = _parse_options(full_text[idx + len(MARKER):])
    return narration, options


async def _load_anchor_events(session: AsyncSession, chapter_id: int) -> list[SceneEvent]:
    """查询章节锚点事件，按 storyTs / sortOrder 排序。"""
    stmt = (
        select(SceneEvent)
        .where(SceneEvent.chapter_id == chapter_id)
        .order_by(SceneEvent.story_ts, SceneEvent.sort_order, SceneEvent.id)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _resolve_anchor(
    session: AsyncSession, flow: StoryFlow, index: int
) -> tuple[SceneEvent | None, int]:
    """解析 index 处（含之后）第一个仍存在的锚点事件。

    推演中途被删的事件逐个跳过；当前及后续全部查不到时返回
    (None, -1) 表示降级为实时生成模式（决策 27）。

    Args:
        session: 数据库会话。
        flow: 剧情流会话。
        index: 待解析的事件下标。

    Returns:
        (锚点事件或 None, 解析后的下标或 -1)。
    """
    anchor_ids = flow.anchor_event_ids or []
    if not anchor_ids or index < 0:
        return None, -1
    remaining = anchor_ids[index:]
    if not remaining:
        return None, -1
    result = await session.execute(
        select(SceneEvent).where(SceneEvent.id.in_(remaining))
    )
    events = {e.id: e for e in result.scalars().all()}
    for offset, eid in enumerate(remaining):
        event = events.get(eid)
        if event:
            return event, index + offset
    return None, -1


async def _get_character_name(
    session: AsyncSession, character_id: int | None
) -> str | None:
    """按 id 查询角色名；角色不存在返回 None。"""
    if not character_id:
        return None
    char = await session.get(Character, character_id)
    return char.name if char else None


async def _build_book_context(session: AsyncSession, book: Book, chapter: Chapter) -> str:
    """组装书籍/章节/创意设定上下文文本。"""
    parts = [f"书名：《{book.title}》"]
    if book.genre:
        parts.append(f"类型：{book.genre}")
    if book.description:
        parts.append(f"简介：{book.description}")
    creative_stmt = select(CreativeSetting).where(CreativeSetting.book_id == book.id)
    creative = (await session.execute(creative_stmt)).scalar_one_or_none()
    if creative:
        if creative.worldview:
            parts.append(f"世界观设定：{creative.worldview[:600]}")
        if creative.tone:
            parts.append(f"文风基调：{creative.tone[:200]}")
        if creative.writing_taboos:
            parts.append(f"写作禁忌（严禁出现）：{creative.writing_taboos[:300]}")
    return "\n".join(parts)


async def _build_event_desc(
    session: AsyncSession,
    event: SceneEvent | None,
    character_names: list[str] | None = None,
) -> str:
    """组装单个锚点事件的描述文本（标题/内容/角色/地点/伏笔/情节线）。

    Args:
        session: 数据库会话。
        event: 锚点事件（可为 None）。
        character_names: 已查询到的出场角色名；为 None 时内部按 event.character_ids
            查询。由调用方预查询一次传入以复用，避免与节点元数据重复查询。
    """
    if event is None:
        return "（自由推演：无锚点事件，由你根据剧情走向自主推进，并保证与决策链自然衔接）"
    parts = [f"- 事件标题：{event.title}"]
    if event.content:
        parts.append(f"- 事件内容：{event.content[:400]}")
    if event.character_ids:
        names = character_names
        if names is None:
            chars = (
                await session.execute(
                    select(Character).where(Character.id.in_(event.character_ids))
                )
            ).scalars().all()
            names = [c.name for c in chars]
        if names:
            parts.append("- 出场角色：" + "、".join(names))
    if event.location_id:
        loc = await session.get(Location, event.location_id)
        if loc:
            parts.append(f"- 地点：{loc.name}")
    if event.resolved_foreshadowing_ids:
        fws = (
            await session.execute(
                select(Foreshadowing).where(
                    Foreshadowing.id.in_(event.resolved_foreshadowing_ids)
                )
            )
        ).scalars().all()
        if fws:
            parts.append(
                "- 关联伏笔：" + "、".join((f.description or "")[:40] for f in fws)
            )
    if event.plot_thread_ids:
        pts = (
            await session.execute(
                select(PlotThread).where(PlotThread.id.in_(event.plot_thread_ids))
            )
        ).scalars().all()
        if pts:
            parts.append("- 关联情节线：" + "、".join(pt.name for pt in pts))
    return "\n".join(parts)


def _build_decision_history(nodes: list[StoryFlowNode]) -> str:
    """把节点序列压缩为决策链历史文本（一律数据库原文）。

    只保留最近 HISTORY_WINDOW 个节点全文，更早的合并为一行「此前共 N 幕」摘要。

    Args:
        nodes: 按 seq 升序的节点列表。

    Returns:
        决策链历史文本。
    """
    if not nodes:
        return "（推演刚开始）"
    recent = nodes[-HISTORY_WINDOW:]
    older = len(nodes) - len(recent)
    lines = []
    if older > 0:
        lines.append(f"（此前共 {older} 幕推演，已省略）")
    for n in recent:
        line = f"【第{n.seq}幕·{n.title}】"
        if n.narration:
            line += n.narration[:120]
        if n.chosen_option:
            line += f"（选择：{n.chosen_option}）"
        lines.append(line)
    return "\n".join(lines)


async def _derive_node_metadata(
    session: AsyncSession,
    event: SceneEvent | None,
    seq: int,
    view_character_id: int | None,
    character_names: list[str] | None = None,
) -> dict:
    """派生节点展示元数据（不依赖 LLM）。

    title=锚点事件标题（实时模式「第 N 幕」）；location_name=事件地点名；
    character_names=事件出场角色名 + 视角角色名（不在其中则补入，决策 26）。

    Args:
        session: 数据库会话。
        event: 锚点事件（可为 None）。
        seq: 节点序号。
        view_character_id: 视角角色 ID（可为 None）。
        character_names: 已查询到的事件出场角色名；为 None 时内部查询（调用方已
            预查询则传入复用，避免重复查询）。

    Returns:
        {title, location_name, character_names}。
    """
    title = event.title.strip() if event and event.title.strip() else f"第 {seq} 幕"
    location_name = None
    names: list[str] = list(character_names) if character_names else []
    if event:
        if event.location_id:
            loc = await session.get(Location, event.location_id)
            location_name = loc.name if loc else None
        if event.character_ids and character_names is None:
            chars = (
                await session.execute(
                    select(Character).where(Character.id.in_(event.character_ids))
                )
            ).scalars().all()
            names = [c.name for c in chars]
    if view_character_id:
        view_char = await session.get(Character, view_character_id)
        if view_char and view_char.name not in names:
            names.append(view_char.name)
    return {
        "title": title,
        "location_name": location_name,
        "character_names": names,
    }


async def _generate_scene_node(
    session: AsyncSession,
    flow: StoryFlow,
    book: Book,
    chapter: Chapter,
    model_config: dict,
    seq: int,
    index: int,
    view_character_id: int | None,
    user_input: str | None = None,
    closing: bool = False,
) -> AsyncGenerator[dict, None]:
    """生成一个场景节点（两段式真流式），落库并推进会话状态。

    事件模式下由 LLM 输出 `###MORE###` 标记决定是否续幕（每事件至多 3 幕，
    MAX_SCENES_PER_EVENT 兜底强制收束）；收尾幕（closing=True）生成后会话
    立即置为 completed。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（当前事务内已加锁/或本请求新建）。
        book: 书籍。
        chapter: 章节。
        model_config: 用户模型配置。
        seq: 新节点序号。
        index: 待解析的锚点事件下标（-1 表示实时/收尾模式）。
        view_character_id: 视角角色 ID。
        user_input: 用户自定义输入原文（可为 None）。
        closing: 是否收尾幕（事件全部推演完后追加的自由收束幕）。

    Yields:
        SSE 事件字典：scene_stream / scene_done / done / error。
    """
    event, resolved_index = await _resolve_anchor(session, flow, index)
    anchor_ids = flow.anchor_event_ids or []
    view_name = await _get_character_name(session, view_character_id)
    event_character_names = (
        [
            c.name
            for c in (
                await session.execute(
                    select(Character).where(Character.id.in_(event.character_ids))
                )
            ).scalars().all()
        ]
        if event and event.character_ids
        else []
    )

    nodes = await repo.get_nodes(session, flow.id)
    event_mode = resolved_index >= 0
    if event_mode:
        scene_index = 1 + sum(
            1 for n in nodes if n.anchored_event_id == event.id
        )
    else:
        scene_index = 0
    max_reached = event_mode and scene_index >= MAX_SCENES_PER_EVENT

    if closing:
        stage_label = "收尾幕"
        last_event = True
    elif event_mode:
        stage_label = f"事件 {resolved_index + 1} / {len(anchor_ids)} · 第 {scene_index} 幕"
        last_event = resolved_index == len(anchor_ids) - 1 and max_reached
    else:
        stage_label = f"第 {seq} 幕"
        last_event = False

    event_desc = await _build_event_desc(session, event, character_names=event_character_names)
    book_context = await _build_book_context(session, book, chapter)
    history = _build_decision_history(nodes)

    prompt = build_scene_prompt(
        book_title=book.title,
        chapter_title=chapter.title,
        chapter_summary=chapter.summary or "",
        event_desc=f"{book_context}\n\n{event_desc}",
        decision_history=history,
        stage_label=stage_label,
        view_character_name=view_name,
        user_input=user_input,
        last_event=last_event,
        closing=closing,
        scene_index=scene_index,
    )
    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content="请开始生成本幕叙事与选项。"),
    ]

    # 在长时间 LLM 流式生成前结束只读事务，避免事务/连接被长时间占用
    await session.commit()

    llm = await _make_llm(model_config)

    # 真流式：LLM token 到达即转发 scene_stream，不做整段收集后补发
    full_text = ""
    emitted = 0
    seen_marker = False
    tail = ""
    try:
        async for piece in _astream_text(llm, messages):
            full_text += piece
            if not seen_marker:
                idx = full_text.find(MARKER)
                if idx >= 0:
                    seen_marker = True
                    tail = full_text[idx + len(MARKER):]
                    forward = full_text[:idx][emitted:]
                    if forward:
                        yield {"type": "scene_stream", "token": forward}
                    emitted = len(full_text[:idx])
                else:
                    forward = full_text[emitted:]
                    if forward:
                        yield {"type": "scene_stream", "token": forward}
                    emitted = len(full_text)
            else:
                tail += piece
    except Exception as exc:
        logger.exception("[story_flow] 场景生成 LLM 调用失败")
        yield {"type": "error", "message": f"场景生成失败: {str(exc)[:100]}"}
        return

    if not seen_marker:
        narration, options = _split_two_phase(full_text)
    else:
        narration = full_text[: full_text.find(MARKER)].strip() or "（本幕叙事为空）"
        options = _parse_options(tail)

    # AI 决定本事件是否续幕：尾区含 ###MORE### 且未达幕数上限（第 3 幕强制收束）
    more = event_mode and not max_reached and MORE_MARKER in tail

    meta = await _derive_node_metadata(
        session, event, seq, view_character_id, character_names=event_character_names
    )
    try:
        node = await repo.add_node(
            session=session,
            flow_id=flow.id,
            seq=seq,
            anchored_event_id=event.id if event else None,
            title=meta["title"],
            narration=narration,
            options=options,
            location_name=meta["location_name"],
            character_names=meta["character_names"],
        )
        flow.round_count += 1
        if closing:
            # 收尾幕：事件全部推演完后的自由收束幕，生成完即完成
            flow.current_event_index = len(anchor_ids)
            flow.status = "completed"
        elif event_mode:
            # 续幕则停留在当前事件，否则推进到下一事件（可能 == len 触发收尾）
            flow.current_event_index = resolved_index if more else resolved_index + 1
        else:
            flow.current_event_index = -1
        await session.commit()
    except IntegrityError:
        # 并发重复插入（(flow_id, seq) 联合唯一约束兜底）：回滚后取已存在的节点
        logger.warning(f"[story_flow] 并发重复插入节点 flow={flow.id} seq={seq}，回退复用已有节点")
        await session.rollback()
        existing = await repo.get_node_by_seq(session, flow.id, seq)
        if existing:
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(existing),
                "completed": False,
                "flow_id": flow.id,
                "anchor_event_ids": flow.anchor_event_ids or [],
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        yield {"type": "error", "message": "场景节点保存失败，请重试"}
        return
    except Exception:
        logger.exception("[story_flow] 场景节点落库失败")
        await session.rollback()
        yield {"type": "error", "message": "场景节点保存失败，请重试"}
        return

    yield {
        "type": "scene_done",
        "node": repo.node_to_dict(node),
        "completed": closing,
        "flow_id": flow.id,
        "anchor_event_ids": flow.anchor_event_ids or [],
        "current_event_index": flow.current_event_index,
    }
    yield {"type": "done"}


async def stream_create_flow(
    session: AsyncSession,
    book: Book,
    chapter: Chapter,
    view_character_id: int | None,
    user_id: int,
    model_config: dict,
) -> AsyncGenerator[dict, None]:
    """创建剧情流会话并生成首场景（幂等：已有 active 流则复用）。

    已有 active 流且有节点 → 直接回放最后节点的 scene_done + done；
    已有 active 流但无节点（上次首场景生成失败遗留）→ 重新生成首场景。

    Args:
        session: 数据库会话。
        book: 书籍（router 已校验归属）。
        chapter: 章节。
        view_character_id: 视角角色 ID（可为 None）。
        user_id: 用户 ID。
        model_config: 用户模型配置。

    Yields:
        SSE 事件字典。
    """
    existing = await repo.get_active_flow(session, book.id, chapter.id, user_id)
    if existing:
        existing_nodes = await repo.get_nodes(session, existing.id)
        if existing_nodes:
            last = existing_nodes[-1]
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(last),
                "completed": existing.status == "completed",
                "flow_id": existing.id,
                "anchor_event_ids": existing.anchor_event_ids or [],
                "current_event_index": existing.current_event_index,
            }
            yield {"type": "done"}
            return
        flow = existing
    else:
        anchors = await _load_anchor_events(session, chapter.id)
        anchor_ids = [e.id for e in anchors]
        flow = await repo.create_flow(
            session=session,
            book_id=book.id,
            chapter_id=chapter.id,
            user_id=user_id,
            anchor_event_ids=anchor_ids,
            current_event_index=0 if anchor_ids else -1,
            view_character_id=view_character_id,
        )
        try:
            await session.commit()
        except Exception:
            logger.exception("[story_flow] 创建会话失败")
            await session.rollback()
            yield {"type": "error", "message": "创建剧情流失败，请重试"}
            return

    async for event in _generate_scene_node(
        session=session,
        flow=flow,
        book=book,
        chapter=chapter,
        model_config=model_config,
        seq=1,
        index=flow.current_event_index,
        view_character_id=flow.view_character_id,
    ):
        yield event


async def stream_advance_flow(
    session: AsyncSession,
    flow: StoryFlow,
    chosen_option_text: str,
    model_config: dict,
    book: Book | None = None,
    chapter: Chapter | None = None,
) -> AsyncGenerator[dict, None]:
    """推进剧情流（写选择 → 幂等检查 → 序列末尾判定 → 生成下一场景）。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（router 已校验归属与 active 状态）。
        chosen_option_text: 用户选择的选项原文（trim 后）。
        model_config: 用户模型配置。
        book: 书籍（懒加载用，可为 None 时内部查询）。
        chapter: 章节（懒加载用，可为 None 时内部查询）。

    Yields:
        SSE 事件字典。
    """
    # ① 幂等检查：最后节点已有后续节点（上一步已生成）→ 直接回放，不重复生成，
    #    也不改写选择（防止把上次的选择文本误写到结果节点上）
    last_node = await repo.get_last_node(session, flow.id)
    if last_node:
        next_node = await repo.get_node_by_seq(session, flow.id, last_node.seq + 1)
        if next_node:
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(next_node),
                "completed": flow.status == "completed",
                "flow_id": flow.id,
                "anchor_event_ids": flow.anchor_event_ids or [],
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        # ② 写最后节点 chosen_option（若未写；已写则保留原值，保证重试幂等）
        if last_node.chosen_option:
            # 已写入不同选项（异常并发）：拒绝覆盖，避免决策链与落库不一致
            if last_node.chosen_option != chosen_option_text:
                yield {"type": "error", "message": "选项已确定，请刷新后重试"}
                return
            # 已写入相同选项：视为重试，继续生成下一节点（幂等）
        else:
            last_node.chosen_option = chosen_option_text
            await session.commit()

    anchor_ids = flow.anchor_event_ids or []

    next_seq = (last_node.seq + 1) if last_node else 1
    if book is None or chapter is None:
        _book = await session.get(Book, flow.book_id)
        _chapter = await session.get(Chapter, flow.chapter_id)
        book = book or _book
        chapter = chapter or _chapter
        if book is None or chapter is None:
            yield {"type": "error", "message": "书籍或章节不存在"}
            return

    # ③ 事件模式：全部事件推演完 → 先追加一幕自由收尾幕（closing）；
    #    收尾幕已生成（最后节点无锚点）→ 结束推演
    if anchor_ids and flow.current_event_index >= len(anchor_ids):
        if last_node and last_node.anchored_event_id is None:
            flow.status = "completed"
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                yield {"type": "error", "message": "保存状态失败，请重试"}
                return
            yield {
                "type": "scene_done",
                "node": None,
                "completed": True,
                "flow_id": flow.id,
                "anchor_event_ids": anchor_ids,
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        async for event in _generate_scene_node(
            session=session,
            flow=flow,
            book=book,
            chapter=chapter,
            model_config=model_config,
            seq=next_seq,
            index=-1,
            view_character_id=flow.view_character_id,
            closing=True,
        ):
            yield event
        return

    # ④ 生成下一幕：事件模式停留在当前事件（AI 以 ###MORE### 决定是否续幕，
    #    幕数上限兜底强制收束），实时模式 index=-1
    async for event in _generate_scene_node(
        session=session,
        flow=flow,
        book=book,
        chapter=chapter,
        model_config=model_config,
        seq=next_seq,
        index=flow.current_event_index if anchor_ids else -1,
        view_character_id=flow.view_character_id,
    ):
        yield event


async def complete_flow(
    session: AsyncSession,
    flow: StoryFlow,
    model_config: dict,
) -> str:
    """结束剧情流并生成推演摘要（幂等；LLM 失败回退决策链文本拼接）。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（router 已校验归属）。
        model_config: 用户模型配置。

    Returns:
        推演摘要（可为空串）。
    """
    if flow.status == "completed":
        return flow.summary or ""

    nodes = await repo.get_nodes(session, flow.id)
    summary = ""
    if nodes:
        decision_chain_text = "\n".join(
            f"{n.title}：{n.chosen_option}" for n in nodes if n.chosen_option
        )
        all_narrations = "\n\n".join(
            f"【第{n.seq}幕·{n.title}】\n{n.narration}" for n in nodes
        )
        book_title = ""
        chapter_title = ""
        book = await session.get(Book, flow.book_id)
        if book:
            book_title = book.title
        chapter = await session.get(Chapter, flow.chapter_id)
        if chapter:
            chapter_title = chapter.title
        try:
            llm = await _make_llm(model_config)
            prompt = build_summary_prompt(
                book_title=book_title,
                chapter_title=chapter_title,
                decision_chain_text=decision_chain_text,
                all_narrations=all_narrations,
            )
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content="请生成推演摘要。"),
            ]
            raw = await llm.ainvoke(messages)
            text = raw.content if hasattr(raw, "content") else str(raw)
            summary = (text or "").strip()
        except Exception as exc:
            logger.warning(f"[story_flow] 摘要生成失败，回退决策链拼接: {exc}")
            summary = fallback_summary_from_nodes(nodes)
        if not summary:
            summary = fallback_summary_from_nodes(nodes)

    flow.status = "completed"
    flow.summary = summary
    try:
        await session.commit()
    except Exception:
        logger.exception("[story_flow] 结束剧情流失败")
        await session.rollback()
    return summary


async def validate_view_character(
    session: AsyncSession, character_id: int, book_id: int
) -> bool:
    """校验视角角色存在且属于本书。

    Args:
        session: 数据库会话。
        character_id: 角色 ID。
        book_id: 书籍 ID。

    Returns:
        是否合法。
    """
    char = await session.get(Character, character_id)
    return bool(char and char.book_id == book_id)
