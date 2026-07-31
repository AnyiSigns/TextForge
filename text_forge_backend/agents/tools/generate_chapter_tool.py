from typing import Optional, Dict, Any, List
from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.model_factory import ModelFactory
from agents.subgraphs.generate_chapter_graph import (
    build_generate_chapter_graph,
    GenerateChapterState,
)
from utils.logger import get_logger

logger = get_logger(__name__)


async def _get_previous_chapter_context(session: AsyncSession, book_id: int, chapter_id: int) -> Dict[str, Any]:
    from model.book import Chapter, ChapterContent, Volume
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


def build_generate_chapter_tool(session_factory, model_config: Optional[dict] = None):
    @tool
    async def generate_chapter(
        book_id: int,
        chapter_id: int,
        instruction: str = "",
        instruction_hint: Optional[str] = None,
    ) -> dict:
        """Generate chapter content based on the provided instruction and context."""
        session = await session_factory()
        from model.book import (
            Book,
            Volume,
            Chapter,
            ChapterContent,
            Character,
            CreativeSetting,
        )
        from repository.project_repo import CharacterRepository
        from repository.outline_repo import OutlineRepository
        from repository.world_repo import WorldRepository

        book_stmt = select(Book).where(Book.id == book_id)
        book_result = await session.execute(book_stmt)
        book = book_result.scalar_one_or_none()
        if not book:
            return {"status": "error", "message": "书籍不存在"}

        char_repo = CharacterRepository(session)
        characters = await char_repo.book_character_detail(
            user_id=book.user_id, book_id=book_id
        )
        outline_repo = OutlineRepository(session)
        outlines = await outline_repo.list_outlines(book_id)
        world_repo = WorldRepository(session)
        locations = await world_repo.list_locations(book_id)
        timeline_events = await world_repo.list_timeline_events(book_id)

        chapter_stmt = select(Chapter).where(Chapter.id == chapter_id)
        chapter_result = await session.execute(chapter_stmt)
        chapter = chapter_result.scalar_one_or_none()
        if not chapter:
            return {"status": "error", "message": "章节不存在"}

        existing_content = ""
        content_stmt = (
            select(ChapterContent)
            .where(ChapterContent.chapter_id == chapter_id)
            .order_by(ChapterContent.id.desc())
        )
        content_result = await session.execute(content_stmt)
        latest_content = content_result.scalar_one_or_none()
        if latest_content:
            existing_content = latest_content.content or ""

        context_parts = []
        context_parts.append(f"书名：{book.title}\n genre：{book.genre or ''}")
        if book.description:
            context_parts.append(f"简介：{book.description}")
        if characters:
            context_parts.append(
                "主要人物：\n"
                + "\n".join(
                    [
                        f"- {c.name}({c.role_type or '角色'}):{c.description or ''}"
                        for c in characters[:10]
                    ]
                )
            )
        if outlines:
            context_parts.append(
                "大纲：\n"
                + "\n".join([f"- {o.title}: {o.content or ''}" for o in outlines[:5]])
            )
        if locations:
            context_parts.append(
                "地点：\n"
                + "\n".join(
                    [
                        f"- {loc.name}({loc.type}):{loc.description or ''}"
                        for loc in locations[:10]
                    ]
                )
            )
        if timeline_events:
            context_parts.append(
                "时间线：\n"
                + "\n".join(
                    [
                        f"- {ev.name}({ev.event_type}):{ev.description or ''}"
                        for ev in timeline_events[:10]
                    ]
                )
            )
        context_parts.append(f"当前章节：{chapter.title}")
        if chapter.summary:
            context_parts.append(f"章节摘要：{chapter.summary}")
        if existing_content:
            context_parts.append(
                f"现有内容（{len(existing_content)}字）：\n{existing_content[:2000]}"
            )

        book_context = "\n\n".join(context_parts)

        previous_context = await _get_previous_chapter_context(session, book_id, chapter_id)

        progress_events: List[Dict[str, Any]] = []

        def _progress_callback(event: Dict[str, Any]):
            progress_events.append(event)

        state: GenerateChapterState = {
            "messages": [],
            "user_id": book.user_id,
            "active_book_id": book_id,
            "model_config": model_config or {},
            "step_outputs": {},
            "previous_chapter_summary": previous_context.get("previous_chapter_summary"),
            "previous_chapter_content": previous_context.get("previous_chapter_content"),
            "cross_chapter_context": previous_context.get("cross_chapter_context", {}),
            "book_id": book_id,
            "chapter_id": chapter_id,
            "instruction": instruction,
            "context": book_context,
            "plan": "",
            "content": "",
            "reflection": "",
            "progress_callback": _progress_callback,
        }

        graph = build_generate_chapter_graph()
        try:
            result = await graph.ainvoke(state)
        except Exception as exc:
            logger.error(f"generate_chapter subgraph 失败: {exc}", exc_info=True)
            return {"status": "error", "message": f"生成失败: {exc}"}

        generated_text = result.get("content", "")
        if not generated_text or not generated_text.strip():
            return {"status": "error", "message": "生成内容为空"}

        try:
            new_version = (latest_content.version + 1) if latest_content else 1
            new_content = ChapterContent(
                chapter_id=chapter_id,
                content=generated_text.strip(),
                version=new_version,
            )
            session.add(new_content)
            await session.commit()
            await session.refresh(new_content)
            return {
                "status": "completed",
                "book_id": book_id,
                "chapter_id": chapter_id,
                "version": new_version,
                "content": generated_text.strip(),
                "characters_count": len(characters),
                "word_count": len(generated_text.strip()),
                "plan": result.get("plan", ""),
                "reflection": result.get("reflection", ""),
                "progress_events": progress_events,
            }
        except Exception as exc:
            logger.error(f"generate_chapter 保存失败: {exc}", exc_info=True)
            return {"status": "error", "message": f"保存失败: {exc}"}

    return generate_chapter
