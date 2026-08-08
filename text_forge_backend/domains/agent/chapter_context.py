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
