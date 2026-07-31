from datetime import datetime
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from domains.writing_session.repository import WritingSessionRepository
from config.logging import get_logger

logger = get_logger(__name__)


class WritingSessionService:
    """写作会话服务层。

    提供写作会话的创建、结束、查询、删除与统计。
    """

    def __init__(self, session: AsyncSession):
        """初始化 WritingSessionService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.repo = WritingSessionRepository(session)

    async def create_session(
        self,
        user_id: int,
        book_id: int,
        chapter_id: Optional[int] = None,
        character_ids: Optional[list] = None,
    ) -> dict:
        """创建写作会话。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            chapter_id: 章节 ID。
            character_ids: 角色 ID 列表。

        Returns:
            会话字典。
        """
        payload = {
            "user_id": user_id,
            "book_id": book_id,
            "chapter_id": chapter_id,
            "character_ids": character_ids or [],
            "words_written": 0,
            "duration_seconds": 0,
            "started_at": datetime.now(),
            "ended_at": None,
        }
        instance = await self.repo.add(**payload)
        await self.repo.session.commit()
        await self.repo.session.refresh(instance)
        return self._to_dict(instance)

    async def end_session(
        self, user_id: int, session_id: int, words_written: int, duration_seconds: int
    ) -> Optional[dict]:
        """结束写作会话。

        Args:
            user_id: 用户 ID。
            session_id: 会话 ID。
            words_written: 写作字数。
            duration_seconds: 持续秒数。

        Returns:
            会话字典，不存在或无权访问返回 None。
        """
        instance = await self.repo.get(session_id)
        if not instance or instance.user_id != user_id:
            return None
        instance.words_written = words_written
        instance.duration_seconds = duration_seconds
        instance.ended_at = datetime.now()
        await self.repo.session.commit()
        await self.repo.session.refresh(instance)
        return self._to_dict(instance)

    async def get_session(self, user_id: int, session_id: int) -> Optional[dict]:
        """获取单个写作会话。

        Args:
            user_id: 用户 ID。
            session_id: 会话 ID。

        Returns:
            会话字典，不存在或无权访问返回 None。
        """
        instance = await self.repo.get(session_id)
        if not instance or instance.user_id != user_id:
            return None
        return self._to_dict(instance)

    async def list_sessions(
        self, user_id: int, book_id: int, chapter_id: Optional[int] = None
    ) -> List[dict]:
        """查询用户写作会话列表。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            chapter_id: 章节 ID。

        Returns:
            会话字典列表。
        """
        items = await self.repo.list_by_user_book(
            user_id=user_id, book_id=book_id, chapter_id=chapter_id
        )
        return [self._to_dict(item) for item in items]

    async def delete_session(self, user_id: int, session_id: int) -> bool:
        """删除写作会话。

        Args:
            user_id: 用户 ID。
            session_id: 会话 ID。

        Returns:
            删除成功返回 True，否则返回 False。
        """
        instance = await self.repo.get(session_id)
        if not instance or instance.user_id != user_id:
            return False
        await self.repo.delete(session_id)
        return True

    async def get_statistics(
        self, user_id: int, book_id: int, chapter_id: Optional[int] = None
    ) -> dict:
        """获取写作统计信息。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            chapter_id: 章节 ID。

        Returns:
            统计信息字典。
        """
        return await self.repo.get_statistics(
            user_id=user_id, book_id=book_id, chapter_id=chapter_id
        )

    async def get_writing_trend(
        self, user_id: int, book_id: int, days: int = 30
    ) -> List[dict]:
        """获取写作趋势。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            days: 天数。

        Returns:
            趋势数据列表。
        """
        return await self.repo.get_writing_trend(
            user_id=user_id, book_id=book_id, days=days
        )

    async def get_character_frequency(self, user_id: int, book_id: int) -> List[dict]:
        """获取角色出现频率。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            频率数据列表。
        """
        return await self.repo.get_character_frequency(user_id=user_id, book_id=book_id)

    async def get_plot_progress(self, user_id: int, book_id: int) -> dict:
        """获取情节进度。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            进度信息字典。
        """
        return await self.repo.get_plot_progress(user_id=user_id, book_id=book_id)

    def _to_dict(self, session) -> dict:
        """将会话模型转换为字典。"""
        return {
            "id": session.id,
            "user_id": session.user_id,
            "book_id": session.book_id,
            "chapter_id": session.chapter_id,
            "character_ids": session.character_ids or [],
            "words_written": session.words_written,
            "duration_seconds": session.duration_seconds,
            "started_at": (
                session.started_at.isoformat() if session.started_at else None
            ),
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        }
