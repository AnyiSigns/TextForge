"""剧情流 — 场景上下文装配（锚点解析/书籍上下文/事件描述/决策链历史/节点元数据）。

与 service.py 的流式执行分离：本模块只负责查询与纯文本构造，不含 LLM 调用与落库。
"""
import json

from config.logging import get_logger
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

DEFAULT_OPTIONS = [{"text": "继续剧情"}]
MARKER = "###OPTIONS###"
MORE_MARKER = "###MORE###"
HISTORY_WINDOW = 6
MAX_SCENES_PER_EVENT = 3


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


__all__ = [
    "DEFAULT_OPTIONS",
    "HISTORY_WINDOW",
    "MARKER",
    "MAX_SCENES_PER_EVENT",
    "MORE_MARKER",
    "_build_book_context",
    "_build_decision_history",
    "_build_event_desc",
    "_derive_node_metadata",
    "_get_character_name",
    "_load_anchor_events",
    "_parse_options",
    "_resolve_anchor",
    "_split_two_phase",
]
