from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from infrastructure.database import db_manager
from schema.request.writing_session import WritingSessionCreateRequest, WritingSessionEndRequest
from schema.response.writing_session import WritingSessionResponse
from service.writing_session_service import WritingSessionService

router = APIRouter(prefix="/writing-sessions", tags=["Writing Sessions"])


def writing_session_db(session: AsyncSession = Depends(db_manager.get_db)) -> WritingSessionService:
    return WritingSessionService(session)


@router.post("/", response_model=WritingSessionResponse)
async def create_session(
    user_id=Depends(get_current),
    request: WritingSessionCreateRequest = ...,
    service: WritingSessionService = Depends(writing_session_db),
):
    session = await service.create_session(
        user_id=user_id,
        book_id=request.book_id,
        chapter_id=request.chapter_id,
        character_ids=request.character_ids,
    )
    return WritingSessionResponse(**session)


@router.put("/{session_id}/end", response_model=WritingSessionResponse)
async def end_session(
    user_id=Depends(get_current),
    session_id: int = ...,
    request: WritingSessionEndRequest = ...,
    service: WritingSessionService = Depends(writing_session_db),
):
    session = await service.end_session(
        user_id=user_id,
        session_id=session_id,
        words_written=request.words_written,
        duration_seconds=request.duration_seconds,
    )
    if not session:
        raise HTTPException(status_code=404, detail="写作会话不存在")
    return WritingSessionResponse(**session)


@router.get("/", response_model=List[WritingSessionResponse])
async def list_sessions(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    chapter_id: Optional[int] = Query(default=None),
    service: WritingSessionService = Depends(writing_session_db),
):
    sessions = await service.list_sessions(user_id=user_id, book_id=book_id, chapter_id=chapter_id)
    return [WritingSessionResponse(**s) for s in sessions]


@router.get("/{session_id}", response_model=WritingSessionResponse)
async def get_session(
    user_id=Depends(get_current),
    session_id: int = ...,
    service: WritingSessionService = Depends(writing_session_db),
):
    session = await service.get_session(user_id=user_id, session_id=session_id)
    if not session:
        raise HTTPException(status_code=404, detail="写作会话不存在")
    return WritingSessionResponse(**session)


@router.delete("/{session_id}")
async def delete_session(
    user_id=Depends(get_current),
    session_id: int = ...,
    service: WritingSessionService = Depends(writing_session_db),
):
    ok = await service.delete_session(user_id=user_id, session_id=session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="写作会话不存在")
    return {"ok": True}


@router.get("/statistics/summary")
async def get_statistics(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    chapter_id: Optional[int] = Query(default=None),
    service: WritingSessionService = Depends(writing_session_db),
):
    stats = await service.get_statistics(user_id=user_id, book_id=book_id, chapter_id=chapter_id)
    return stats


@router.get("/statistics/writing-trend")
async def get_writing_trend(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    days: int = Query(30, ge=1, le=365),
    service: WritingSessionService = Depends(writing_session_db),
):
    trend = await service.get_writing_trend(user_id=user_id, book_id=book_id, days=days)
    return {"book_id": book_id, "days": days, "trend": trend}


@router.get("/statistics/character-frequency")
async def get_character_frequency(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    service: WritingSessionService = Depends(writing_session_db),
):
    freq = await service.get_character_frequency(user_id=user_id, book_id=book_id)
    return {"book_id": book_id, "frequency": freq}


@router.get("/statistics/plot-progress")
async def get_plot_progress(
    user_id=Depends(get_current),
    book_id: int = Query(...),
    service: WritingSessionService = Depends(writing_session_db),
):
    progress = await service.get_plot_progress(user_id=user_id, book_id=book_id)
    return {"book_id": book_id, "progress": progress}
