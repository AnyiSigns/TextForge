from typing import Annotated

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import select

logger = get_logger(__name__)


def _build_feedback_tools(session_factory, model_config: dict | None = None):
    @tool
    async def analyze_feedback_patterns(
        days: Annotated[int, "分析最近多少天的反馈"] = 30,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """分析用户在指定天数内的反馈模式，识别问题和趋势。

        Args:
            days: 分析最近多少天内的反馈数据。
        """
        logger.debug(
            f"[tool] analyze_feedback_patterns  user_id={user_id}  book_id={book_id}  days={days}"
        )
        async with session_factory() as session:
            from datetime import datetime, timedelta

            from models.agent_memory import AgentMemory

            cutoff = datetime.now() - timedelta(days=days)
            stmt = select(AgentMemory).where(
                AgentMemory.user_id == user_id,
                AgentMemory.source == "user_feedback",
                AgentMemory.created_at >= cutoff,
            )
            effective_book_id = book_id if book_id else None
            if effective_book_id is not None:
                stmt = stmt.where(AgentMemory.book_id == effective_book_id)
            result = await session.execute(stmt)
            memories = result.scalars().all()
            feedback_items = []
            for m in memories:
                try:
                    meta = m.meta or {}
                    feedback_items.append(
                        {
                            "memory_id": m.id,
                            "content": m.content,
                            "memory_type": m.memory_type,
                            "book_id": m.book_id,
                            "chapter_id": m.related_chapter_id,
                            "created_at": (
                                m.created_at.isoformat() if m.created_at else None
                            ),
                            "sentiment": meta.get("sentiment"),
                            "feedback_type": meta.get("feedback_type"),
                        }
                    )
                except Exception:
                    continue
            patterns = {}
            positive = sum(
                1 for item in feedback_items if item.get("sentiment") == "positive"
            )
            negative = sum(
                1 for item in feedback_items if item.get("sentiment") == "negative"
            )
            patterns["total_feedback"] = len(feedback_items)
            patterns["positive"] = positive
            patterns["negative"] = negative
            patterns["ratio"] = f"{positive}:{negative}" if feedback_items else "0:0"
            chapters = {}
            for item in feedback_items:
                cid = item.get("chapter_id")
                if not cid:
                    continue
                chapters.setdefault(cid, {"count": 0, "negative": 0})
                chapters[cid]["count"] += 1
                if item.get("sentiment") == "negative":
                    chapters[cid]["negative"] += 1
            problem_chapters = [
                {
                    "chapter_id": cid,
                    "feedback_count": data["count"],
                    "negative_count": data["negative"],
                }
                for cid, data in chapters.items()
                if data["negative"] > data["count"] / 2
            ]
            patterns["problem_chapters"] = sorted(
                problem_chapters, key=lambda x: x["negative_count"], reverse=True
            )[:10]
            suggestions = []
            if negative > positive * 2:
                suggestions.append("负面反馈显著多于正面，建议检查文风设定和人物一致性")
            if problem_chapters:
                worst = problem_chapters[0]
                suggestions.append(
                    f"第 {worst['chapter_id']} 章负面反馈最多，建议优先优化"
                )
            patterns["suggestions"] = suggestions
            return {
                "book_id": book_id,
                "patterns": patterns,
                "sample_feedback": feedback_items[:10],
            }

    @tool
    async def get_proactive_suggestions(
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """获取当前书籍的主动建议，识别缺失摘要、未回收伏笔、停滞剧情等问题。

        Returns:
            建议列表，每项含 type、severity、message 及相关的 ID 列表。
        """
        logger.debug(f"[tool] get_proactive_suggestions  book_id={book_id}")
        async with session_factory() as session:
            from models.book import Chapter, Foreshadowing, PlotThread, Volume

            suggestions = []
            try:
                vol_stmt = select(Volume.id).where(Volume.book_id == book_id)
                vol_result = await session.execute(vol_stmt)
                vol_ids = [row[0] for row in vol_result.all()]
                if vol_ids:
                    chapter_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids))
                    chapter_result = await session.execute(chapter_stmt)
                    chapters = chapter_result.scalars().all()
                    no_summary = [c for c in chapters if not (c.summary or "").strip()]
                    if no_summary:
                        suggestions.append(
                            {
                                "type": "summary_missing",
                                "severity": "medium",
                                "message": f"{len(no_summary)} 个章节缺少摘要",
                                "chapter_ids": [c.id for c in no_summary[:5]],
                            }
                        )
                foreshadowing_stmt = select(Foreshadowing).where(
                    Foreshadowing.book_id == book_id,
                    Foreshadowing.status == "planted",
                    Foreshadowing.planted_at_chapter_id.isnot(None),
                )
                foreshadowing_result = await session.execute(foreshadowing_stmt)
                planted = foreshadowing_result.scalars().all()
                if planted:
                    suggestions.append(
                        {
                            "type": "foreshadowing_due",
                            "severity": "low",
                            "message": f"{len(planted)} 个伏笔已埋下，建议安排回收",
                            "count": len(planted),
                        }
                    )
                thread_stmt = select(PlotThread).where(
                    PlotThread.book_id == book_id,
                    PlotThread.status == "active",
                )
                thread_result = await session.execute(thread_stmt)
                threads = thread_result.scalars().all()
                stalled = [t for t in threads if not (t.progress_note or "").strip()]
                if stalled:
                    suggestions.append(
                        {
                            "type": "plot_thread_stalled",
                            "severity": "medium",
                            "message": f"{len(stalled)} 个情节脉络缺少进展记录",
                            "thread_ids": [t.id for t in stalled[:5]],
                        }
                    )
                chapter_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids))
                chapter_result = await session.execute(chapter_stmt)
                chapters = chapter_result.scalars().all()
                if chapters:
                    lengths = [len((c.summary or "").strip()) for c in chapters]
                    avg_len = sum(lengths) / len(lengths) if lengths else 0
                    short = [
                        c.id
                        for c, length in zip(chapters, lengths)
                        if length < avg_len * 0.3 and length < 50
                    ]
                    long = [
                        c.id
                        for c, length in zip(chapters, lengths)
                        if length > avg_len * 2
                    ]
                    if short:
                        suggestions.append(
                            {
                                "type": "pacing_imbalance",
                                "severity": "medium",
                                "message": f"{len(short)} 个章节摘要显著偏短，节奏可能过快",
                                "chapter_ids": short[:5],
                            }
                        )
                    if long:
                        suggestions.append(
                            {
                                "type": "pacing_imbalance",
                                "severity": "low",
                                "message": f"{len(long)} 个章节摘要偏长，节奏可能过慢",
                                "chapter_ids": long[:5],
                            }
                        )
            except Exception as exc:
                logger.warning(f"get_proactive_suggestions 失败: {exc}")
            return suggestions

    return {
        "analyze_feedback_patterns": analyze_feedback_patterns,
        "proactive_suggestions": get_proactive_suggestions,
    }
