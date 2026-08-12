from typing import Annotated, Any

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import select

from ..chapter_context import get_previous_chapter_context
from ..subgraphs.generate_chapter_graph import (
    GenerateChapterState,
    build_generate_chapter_graph,
)

logger = get_logger(__name__)


def build_generate_chapter_tool(session_factory, model_config: dict | None = None):
    @tool
    async def generate_chapter(
        chapter_id: Annotated[int, "目标章节 ID"],
        instruction: Annotated[str, "创作指令，描述章节的写作要求"] = "",
        instruction_hint: Annotated[str | None, "额外的创作提示，会追加到 instruction 末尾"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        personal_rag_results: Annotated[list[dict] | None, InjectedState("personal_rag_results")] = None,
    ) -> dict:
        """生成指定章节的完整正文，并自动写入章节内容库（新增版本，不覆盖）。

        依据书籍全局上下文（书名/简介/角色/全书大纲/关联伏笔/进行中情节线/地点/时间线）
        与前一章衔接内容，按「规划→创作→反思」子图流程生成正文，直接落库。

        Args:
            chapter_id: 目标章节 ID，必须是当前书籍大纲中已存在的章节。
            instruction: 创作指令，描述本章的写作要求（主题、冲突、情感走向等）。
            instruction_hint: 额外的创作提示，会追加到 instruction 末尾。
            book_id: 当前活动书籍 ID（自动注入）。

        Returns:
            成功返回 {"status": "completed", "chapter_id", "version", "word_count", ...}；
            失败返回 {"status": "error", "message"}。
        """
        logger.debug(f"[tool] generate_chapter  book_id={book_id}  chapter_id={chapter_id}  instruction_len={len(instruction)}")
        if instruction_hint:
            instruction = f"{instruction}\n\n创作提示：{instruction_hint}"
        async with session_factory() as session:
            from models.book import (
                Book,
                Chapter,
                ChapterContent,
                Volume,
            )

            from domains.book.repository import CharacterRepository
            from domains.world.repository import WorldRepository

            book_stmt = select(Book).where(Book.id == book_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"status": "error", "message": "书籍不存在"}

            char_repo = CharacterRepository(session)
            characters = await char_repo.book_character_detail(
                user_id=book.user_id, book_id=book_id
            )
            world_repo = WorldRepository(session)
            locations = await world_repo.list_locations(book_id)
            scene_events = await world_repo.list_scene_events(book_id)

            chapter_stmt = (
                select(Chapter)
                .join(Volume, Chapter.volume_id == Volume.id)
                .where(Chapter.id == chapter_id, Volume.book_id == book_id)
            )
            chapter_result = await session.execute(chapter_stmt)
            chapter = chapter_result.scalar_one_or_none()
            if not chapter:
                return {"status": "error", "message": "章节不存在或不属于当前书籍"}
            if getattr(chapter, "locked", False):
                return {"status": "error", "message": "章节已锁定，禁止生成覆盖正文，请先解锁"}

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
            vol_stmt = select(Volume).where(Volume.book_id == book_id)
            vol_result = await session.execute(vol_stmt)
            vol_ids = [r[0] for r in vol_result.all()]
            ch_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids)) if vol_ids else select(Chapter).where(Chapter.id == -1)
            ch_result = await session.execute(ch_stmt)
            chapters = ch_result.scalars().all()
            if chapters:
                context_parts.append(
                    "大纲（全部章节）：\n"
                    +                     "\n".join([f"- {c.title}: {c.summary or ''}" for c in chapters])
                )

            foreshadowings = await world_repo.list_foreshadowings(book_id)
            chapter_foreshadowings = [
                f for f in foreshadowings
                if f.planted_at_chapter_id == chapter_id or f.resolved_at_chapter_id == chapter_id
            ]
            if chapter_foreshadowings:
                context_parts.append(
                    "本章关联伏笔：\n"
                    + "\n".join([
                        f"- [{f.status}] {f.description or ''}" for f in chapter_foreshadowings
                    ])
                )

            plot_threads = await world_repo.list_plot_threads(book_id)
            active_threads = [
                t for t in plot_threads
                if t.status == "active"
                and (
                    t.start_chapter_id is None
                    or t.start_chapter_id <= chapter_id
                )
                and (
                    t.end_chapter_id is None
                    or t.end_chapter_id >= chapter_id
                )
            ]
            if active_threads:
                context_parts.append(
                    "当前进行中的情节线：\n"
                    + "\n".join([
                        f"- {t.name}：{t.description or ''}" for t in active_threads
                    ])
                )

            if hasattr(chapter, "generation_batch") and chapter.generation_batch and chapter.generation_batch > 1:
                context_parts.append(f"（本批为第 {chapter.generation_batch} 批次扩展）")
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
            if scene_events:
                context_parts.append(
                    "时间线：\n"
                    + "\n".join(
                        [
                            f"- {ev.title}({ev.event_type}):{ev.content or ''}"
                            for ev in scene_events[:10]
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

            if personal_rag_results:
                from ..workflow_context import _format_external_documents

                _rag_block = _format_external_documents(
                    personal_rag_results[:3],
                    section_title="个人知识库检索结果",
                )
                if _rag_block:
                    context_parts.append(_rag_block)

            book_context = "\n\n".join(context_parts)

            previous_context = await get_previous_chapter_context(session, book_id, chapter_id)

            progress_events: list[dict[str, Any]] = []

            def _progress_callback(event: dict[str, Any]):
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
                from shared.utils import redact_sensitive

                return {"status": "error", "message": f"生成失败: {redact_sensitive(str(exc))}"}

            generated_text = result.get("content", "")
            if not generated_text or not generated_text.strip():
                return {"status": "error", "message": "生成内容为空"}

            try:
                from sqlalchemy import func
                from sqlalchemy.exc import IntegrityError

                # 版本号在 (chapter_id, version) 唯一约束下计算：并发写入撞号时
                # 捕获 IntegrityError 重算版本号重试一次，避免 500 与重复版本。
                for attempt in range(2):
                    if attempt > 0:
                        # 重试时重新查询最新版本：撞号意味着已有新版本提交，
                        # 必须基于新 max 计算，否则重试仍使用同一版本号再次失败。
                        max_ver = (
                            await session.execute(
                                select(func.max(ChapterContent.version)).where(
                                    ChapterContent.chapter_id == chapter_id
                                )
                            )
                        ).scalar() or 0
                        new_version = max_ver + 1
                    else:
                        new_version = (
                            (latest_content.version + 1) if latest_content else 1
                        )
                    new_content = ChapterContent(
                        chapter_id=chapter_id,
                        content=generated_text.strip(),
                        version=new_version,
                    )
                    session.add(new_content)
                    try:
                        await session.commit()
                        await session.refresh(new_content)
                        break
                    except IntegrityError:
                        await session.rollback()
                        if attempt == 0:
                            continue
                        raise
                else:  # pragma: no cover
                    raise RuntimeError("生成内容保存失败（版本冲突重试后仍失败）")
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
                from shared.utils import redact_sensitive

                return {"status": "error", "message": f"保存失败: {redact_sensitive(str(exc))}"}

    return generate_chapter
