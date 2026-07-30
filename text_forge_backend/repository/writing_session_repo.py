from datetime import datetime, timedelta
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from repository.base_repo import BaseRepository
from model.writing_session import WritingSession
from typing import List, Dict, Any


class WritingSessionRepository(BaseRepository[WritingSession]):
    """写作会话仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 WritingSessionRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(WritingSession, session)

    async def list_by_user_book(self, user_id: int, book_id: int, chapter_id: int | None = None):
        """查询用户书籍下的写作会话列表。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            chapter_id: 章节 ID，可选。

        Returns:
            写作会话实例列表。
        """
        stmt = select(WritingSession).where(
            WritingSession.user_id == user_id,
            WritingSession.book_id == book_id,
        )
        if chapter_id is not None:
            stmt = stmt.where(WritingSession.chapter_id == chapter_id)
        stmt = stmt.order_by(WritingSession.started_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_statistics(self, user_id: int, book_id: int, chapter_id: int | None = None):
        """获取写作统计信息。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            chapter_id: 章节 ID，可选。

        Returns:
            统计信息字典。
        """
        stmt = select(
            func.count(WritingSession.id).label("session_count"),
            func.coalesce(func.sum(WritingSession.words_written), 0).label("total_words"),
            func.coalesce(func.sum(WritingSession.duration_seconds), 0).label("total_duration_seconds"),
            func.coalesce(func.avg(WritingSession.duration_seconds), 0).label("avg_duration_seconds"),
            func.coalesce(func.avg(WritingSession.words_written), 0).label("avg_words_per_session"),
        ).where(
            WritingSession.user_id == user_id,
            WritingSession.book_id == book_id,
        )
        if chapter_id is not None:
            stmt = stmt.where(WritingSession.chapter_id == chapter_id)
        result = await self.session.execute(stmt)
        row = result.mappings().first()
        if not row:
            return {
                "session_count": 0,
                "total_words": 0,
                "total_duration_seconds": 0,
                "avg_duration_seconds": 0,
                "avg_words_per_session": 0,
            }
        return dict(row)

    async def get_writing_trend(self, user_id: int, book_id: int, days: int = 30) -> List[Dict[str, Any]]:
        """获取写作趋势。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            days: 统计天数。

        Returns:
            趋势数据列表。
        """
        cutoff = datetime.now() - timedelta(days=days)
        stmt = (
            select(
                cast(WritingSession.started_at, Date).label("date"),
                func.count(WritingSession.id).label("session_count"),
                func.coalesce(func.sum(WritingSession.words_written), 0).label("words"),
                func.coalesce(func.sum(WritingSession.duration_seconds), 0).label("duration_seconds"),
            )
            .where(
                WritingSession.user_id == user_id,
                WritingSession.book_id == book_id,
                WritingSession.started_at >= cutoff,
            )
            .group_by(cast(WritingSession.started_at, Date))
            .order_by(cast(WritingSession.started_at, Date))
        )
        result = await self.session.execute(stmt)
        rows = result.mappings().all()
        return [
            {
                "date": row["date"].isoformat() if row["date"] else None,
                "session_count": row["session_count"],
                "words": row["words"],
                "duration_seconds": row["duration_seconds"],
            }
            for row in rows
        ]

    async def get_character_frequency(self, user_id: int, book_id: int) -> List[Dict[str, Any]]:
        """获取角色出现频率。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            频率数据列表。
        """
        stmt = select(WritingSession).where(
            WritingSession.user_id == user_id,
            WritingSession.book_id == book_id,
        )
        result = await self.session.execute(stmt)
        sessions = result.scalars().all()
        frequency: Dict[int, Dict[str, Any]] = {}
        for s in sessions:
            for cid in (s.character_ids or []):
                cid = int(cid)
                if cid not in frequency:
                    frequency[cid] = {"character_id": cid, "session_count": 0, "total_words": 0}
                frequency[cid]["session_count"] += 1
                frequency[cid]["total_words"] += s.words_written or 0
        return sorted(frequency.values(), key=lambda x: x["total_words"], reverse=True)

    async def get_plot_progress(self, user_id: int, book_id: int) -> Dict[str, Any]:
        """获取情节进度。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            进度信息字典。
        """
        from model.book import Chapter, Volume
        vol_stmt = select(Volume.id).where(Volume.book_id == book_id)
        vol_result = await self.session.execute(vol_stmt)
        vol_ids = [row[0] for row in vol_result.all()]
        total_chapters = 0
        chapter_progress = {}
        if vol_ids:
            chapter_stmt = select(Chapter.id, Chapter.title, Chapter.summary).where(Chapter.volume_id.in_(vol_ids))
            chapter_result = await self.session.execute(chapter_stmt)
            chapters = chapter_result.all()
            total_chapters = len(chapters)
            for row in chapters:
                cid = row[0]
                chapter_progress[cid] = {
                    "chapter_id": cid,
                    "title": row[1],
                    "has_summary": bool((row[2] or "").strip()),
                }
        session_stats_stmt = select(
            WritingSession.chapter_id,
            func.count(WritingSession.id).label("session_count"),
            func.coalesce(func.sum(WritingSession.words_written), 0).label("total_words"),
        ).where(
            WritingSession.user_id == user_id,
            WritingSession.book_id == book_id,
            WritingSession.chapter_id.isnot(None),
        ).group_by(WritingSession.chapter_id)
        session_stats_result = await self.session.execute(session_stats_stmt)
        session_stats = {row[0]: {"session_count": row[1], "total_words": row[2]} for row in session_stats_result.all()}
        chapters_with_content = sum(1 for cid in chapter_progress if cid in session_stats and session_stats[cid]["total_words"] > 0)
        progress = {
            "total_chapters": total_chapters,
            "chapters_with_content": chapters_with_content,
            "completion_rate": round(chapters_with_content / total_chapters, 4) if total_chapters else 0,
            "chapter_details": [
                {
                    "chapter_id": cid,
                    "title": detail["title"],
                    "has_summary": detail["has_summary"],
                    "session_count": session_stats.get(cid, {}).get("session_count", 0),
                    "total_words": session_stats.get(cid, {}).get("total_words", 0),
                }
                for cid, detail in chapter_progress.items()
            ],
        }
        return progress
