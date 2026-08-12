from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger

logger = get_logger(__name__)


async def get_previous_chapter_context(session: AsyncSession, book_id: int, chapter_id: int) -> dict[str, Any]:
    from models.book import Chapter, ChapterContent, Volume

    chapter_stmt = select(Chapter).where(Chapter.id == chapter_id)
    chapter_result = await session.execute(chapter_stmt)
    current_chapter = chapter_result.scalar_one_or_none()
    if not current_chapter:
        return {"previous_chapter_summary": None, "previous_chapter_content": None, "cross_chapter_context": {}}

    volume_stmt = select(Volume).where(Volume.id == current_chapter.volume_id)
    volume_result = await session.execute(volume_stmt)
    volume = volume_result.scalar_one_or_none()
    if not volume:
        return {"previous_chapter_summary": None, "previous_chapter_content": None, "cross_chapter_context": {}}

    prev_chapter_stmt = (
        select(Chapter)
        .where(
            Chapter.volume_id == volume.id,
            Chapter.sort_order < current_chapter.sort_order,
        )
        .order_by(Chapter.sort_order.desc())
        .limit(1)
    )
    prev_chapter_result = await session.execute(prev_chapter_stmt)
    prev_chapter = prev_chapter_result.scalar_one_or_none()
    if not prev_chapter:
        return {"previous_chapter_summary": None, "previous_chapter_content": None, "cross_chapter_context": {}}

    prev_summary = prev_chapter.summary or ""
    content_stmt = (
        select(ChapterContent)
        .where(ChapterContent.chapter_id == prev_chapter.id)
        .order_by(ChapterContent.version.desc())
        .limit(1)
    )
    content_result = await session.execute(content_stmt)
    prev_content_obj = content_result.scalar_one_or_none()
    prev_content = prev_content_obj.content or "" if prev_content_obj else ""

    cross_chapter_context = {
        "previous_chapter_id": prev_chapter.id,
        "previous_chapter_title": prev_chapter.title,
        "volume_title": volume.title,
        "chapters_before": [prev_chapter.id],
    }
    return {
        "previous_chapter_summary": prev_summary,
        "previous_chapter_content": prev_content,
        "cross_chapter_context": cross_chapter_context,
    }


async def build_domain_context(session: AsyncSession, book_id: int, subgraph: str) -> str:
    """为 drafting/revising 子图装配域上下文（章摘要 + 场景事件 + 角色卡）。

    在 supervisor 将新用户消息路由到 drafting/revising 时调用，把该书的
    最近章节摘要/场景事件与出场角色卡拼成紧凑文本，随 domain_context 注入子图 prompt，
    避免模型在写正文/修订时对全书全量扫描（域上下文自动装配，对齐 Copilot 按任务挑相关文件）。
    """
    from models.book import Book, Character, Chapter, ChapterContent, SceneEvent, Volume

    book = (
        await session.execute(select(Book).where(Book.id == book_id))
    ).scalar_one_or_none()
    if not book:
        return ""
    parts: list[str] = [f"书名：{book.title or ''}"]

    # 最近 N 章（含摘要 + 场景事件概要）。
    # 排序必须按 卷 → 章 复合键：Chapter.sort_order 是「卷内」序号（build_outline 按
    # volume_id 取 max+1），仅按 sort_order 会跨卷混排（如 卷1 ch50 排在 卷2 ch3 之前）。
    # 卷信息一次取回（join 成行），避免逐章 N+1 查询。
    chapter_rows = (
        (
            await session.execute(
                select(Chapter, Volume.sort_order)
                .join(Volume, Volume.id == Chapter.volume_id)
                .where(Volume.book_id == book_id)
                .order_by(
                    Volume.sort_order.desc(),
                    Chapter.sort_order.desc(),
                    Chapter.id.desc(),
                )
                .limit(6)
            )
        )
        .all()
    )
    if chapter_rows:
        ch_lines: list[str] = []
        # 场景事件一次 IN 取回并按章分组，避免逐章查询
        _ev_by_chapter: dict[int, list] = {}
        _ev_rows = (
            (
                await session.execute(
                    select(SceneEvent)
                    .where(SceneEvent.chapter_id.in_([c.id for c, _ in chapter_rows]))
                    .order_by(SceneEvent.chapter_id, SceneEvent.sort_order, SceneEvent.id)
                )
            )
            .scalars()
            .all()
        )
        for _e in _ev_rows:
            _ev_by_chapter.setdefault(_e.chapter_id, []).append(_e)
        for ch, vol_sort in reversed(chapter_rows):
            vol_label = f"第{vol_sort}卷·" if vol_sort is not None else ""
            summary = (ch.summary or "").strip()
            header = f"{vol_label}第{ch.sort_order}章《{ch.title}》" + (f"：{summary[:200]}" if summary else "（无摘要）")
            events = (_ev_by_chapter.get(ch.id) or [])[:3]
            if events:
                ev_text = "；".join(
                    f"{e.title}" + (f"（{e.story_label}）" if e.story_label else "")
                    for e in events
                )
                header += f"｜场景：{ev_text[:200]}"
            ch_lines.append(header)
        parts.append("最近章节（含摘要与场景）：\n" + "\n".join(ch_lines))

    # 角色卡
    characters = (
        (
            await session.execute(
                select(Character)
                .where(Character.book_id == book_id)
                .order_by(Character.id)
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    if characters:
        char_lines = []
        for c in characters:
            desc = (c.description or "").strip()
            entry = f"{c.name}" + (f"（{c.role_type}）" if c.role_type else "")
            if desc:
                entry += f"：{desc[:120]}"
            char_lines.append(entry)
        parts.append("角色卡：\n" + "\n".join(char_lines))

    if subgraph == "revising" and chapter_rows:
        latest = chapter_rows[0][0]  # 最近章（卷序 desc 的第一行）
        content_obj = (
            (
                await session.execute(
                    select(ChapterContent)
                    .where(ChapterContent.chapter_id == latest.id)
                    .order_by(ChapterContent.version.desc())
                    .limit(1)
                )
            )
            .scalar_one_or_none()
        )
        if content_obj and content_obj.content:
            parts.append(f"最近章节《{latest.title}》正文开头：\n{content_obj.content[:800]}")

    return "\n\n".join(parts)[:4000]
