from datetime import datetime
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from repository.writing_session_repo import WritingSessionRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class WritingSessionService:
    def __init__(self, session: AsyncSession):
        self.repo = WritingSessionRepository(session)

    async def create_session(self, user_id: int, book_id: int, chapter_id: Optional[int] = None, character_ids: Optional[list] = None) -> dict:
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
        return self._to_dict(instance)

    async def end_session(self, user_id: int, session_id: int, words_written: int, duration_seconds: int) -> Optional[dict]:
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
        instance = await self.repo.get(session_id)
        if not instance or instance.user_id != user_id:
            return None
        return self._to_dict(instance)

    async def list_sessions(self, user_id: int, book_id: int, chapter_id: Optional[int] = None) -> List[dict]:
        items = await self.repo.list_by_user_book(user_id=user_id, book_id=book_id, chapter_id=chapter_id)
        return [self._to_dict(item) for item in items]

    async def delete_session(self, user_id: int, session_id: int) -> bool:
        instance = await self.repo.get(session_id)
        if not instance or instance.user_id != user_id:
            return False
        await self.repo.delete(session_id)
        return True

    async def get_statistics(self, user_id: int, book_id: int, chapter_id: Optional[int] = None) -> dict:
        return await self.repo.get_statistics(user_id=user_id, book_id=book_id, chapter_id=chapter_id)

    async def get_writing_trend(self, user_id: int, book_id: int, days: int = 30) -> List[dict]:
        return await self.repo.get_writing_trend(user_id=user_id, book_id=book_id, days=days)

    async def get_character_frequency(self, user_id: int, book_id: int) -> List[dict]:
        return await self.repo.get_character_frequency(user_id=user_id, book_id=book_id)

    async def get_plot_progress(self, user_id: int, book_id: int) -> dict:
        return await self.repo.get_plot_progress(user_id=user_id, book_id=book_id)

    def _to_dict(self, session) -> dict:
        return {
            "id": session.id,
            "user_id": session.user_id,
            "book_id": session.book_id,
            "chapter_id": session.chapter_id,
            "character_ids": session.character_ids or [],
            "words_written": session.words_written,
            "duration_seconds": session.duration_seconds,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        }
