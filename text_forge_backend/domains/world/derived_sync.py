"""大纲派生字段重算。

角色/情节线/伏笔的"开始"类与范围类字段以大纲（场景事件）为唯一来源：
- 章节角色 = 该章场景事件角色并集（Chapter.character_ids property，见 models/book.py）
- 情节线 start_chapter_id / related_character_ids = 挂该线场景事件的首个章节 / 角色并集
- 情节线 end_chapter_id = 标记完结的场景事件所在章节，status 联动 completed
- 伏笔 planted_at_chapter_id = 关联埋下事件（related_event_id）所在章节
- 伏笔 resolved_at_chapter_id = 标记揭示的场景事件所在章节，status 联动 resolved

场景事件（SceneEvent）增删改后调用 recompute_derived 同步这些派生列。
"""

import asyncio
from functools import partial

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from models.book import Foreshadowing, PlotThread, SceneEvent
from shared.database import db_manager

logger = get_logger(__name__)


async def _load_scene_events(session: AsyncSession, book_id: int) -> list[SceneEvent]:
    """加载一本书的全部场景事件，按故事时序排序。

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。

    Returns:
        按 story_ts / sort_order 排序的场景事件列表。
    """
    stmt = (
        select(SceneEvent)
        .where(SceneEvent.book_id == book_id)
        .order_by(SceneEvent.story_ts, SceneEvent.sort_order, SceneEvent.id)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _sync_plot_threads(
    session: AsyncSession, events: list[SceneEvent], book_id: int
) -> None:
    """根据场景事件重算所有情节线的派生字段。

    Args:
        session: 数据库会话。
        events: 该书全部场景事件（已按时序排序）。
        book_id: 书籍 ID。
    """
    threads = (
        (
            await session.execute(
                select(PlotThread).where(PlotThread.book_id == book_id)
            )
        )
        .scalars()
        .all()
    )
    for t in threads:
        tid = t.id
        related = [e for e in events if tid in (e.plot_thread_ids or [])]
        completed = [e for e in related if tid in (e.completed_plot_thread_ids or [])]
        if related:
            t.start_chapter_id = related[0].chapter_id
            chars: list[int] = []
            for e in related:
                for cid in e.character_ids or []:
                    if cid not in chars:
                        chars.append(cid)
            t.related_character_ids = chars
        else:
            t.start_chapter_id = None
            t.related_character_ids = []
        if completed:
            t.end_chapter_id = completed[-1].chapter_id
        else:
            t.end_chapter_id = None
        # 状态完全由大纲派生：有完结场景 → completed，否则 active
        t.status = "completed" if completed else "active"


async def _sync_foreshadowings(
    session: AsyncSession, events: list[SceneEvent], book_id: int
) -> None:
    """根据场景事件重算所有伏笔的派生字段。

    Args:
        session: 数据库会话。
        events: 该书全部场景事件（已按时序排序）。
        book_id: 书籍 ID。
    """
    items = (
        (
            await session.execute(
                select(Foreshadowing).where(Foreshadowing.book_id == book_id)
            )
        )
        .scalars()
        .all()
    )
    if not items:
        return
    event_by_id = {e.id: e for e in events}
    for f in items:
        planted_event = event_by_id.get(f.related_event_id) if f.related_event_id else None
        if planted_event:
            f.planted_at_chapter_id = planted_event.chapter_id
        else:
            f.planted_at_chapter_id = None
        reveal = [e for e in events if f.id in (e.resolved_foreshadowing_ids or [])]
        if reveal:
            f.resolved_at_chapter_id = reveal[-1].chapter_id
        else:
            f.resolved_at_chapter_id = None
        # 状态完全由大纲派生：有揭示场景 → resolved，否则 planted
        f.status = "resolved" if reveal else "planted"


async def recompute_derived(session: AsyncSession, book_id: int) -> None:
    """重算一本书由大纲派生的情节线/伏笔字段。

    场景事件增删改、伏笔关联埋下事件、情节线标记完结后调用。

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。
    """
    try:
        events = await _load_scene_events(session, book_id)
        await _sync_plot_threads(session, events, book_id)
        await _sync_foreshadowings(session, events, book_id)
        await session.commit()
    except Exception:
        logger.exception(f"recompute_derived 失败 book_id={book_id}")
        raise


# 每本书一个待执行重算任务：新变更取消旧任务（防抖，同时避免并发写冲突）
_pending_recompute: dict[int, asyncio.Task] = {}


def _recompute_done(book_id: int, task: asyncio.Task) -> None:
    """任务结束后仅当仍是当前任务时才移除，避免误删新任务的引用。"""
    if _pending_recompute.get(book_id) is task:
        _pending_recompute.pop(book_id, None)


def schedule_recompute(book_id: int) -> None:
    """异步防抖触发整本书派生字段重算，不阻塞调用方请求。

    同一本书的连续变更只保留最后一次重算；重算在独立会话中执行，
    因此调用方必须先在自己的会话中提交变更，否则后台任务读不到新数据。

    Args:
        book_id: 书籍 ID。
    """
    prev = _pending_recompute.get(book_id)
    if prev and not prev.done():
        prev.cancel()
    task = asyncio.create_task(_run_recompute(book_id))
    _pending_recompute[book_id] = task
    task.add_done_callback(partial(_recompute_done, book_id))


async def _run_recompute(book_id: int) -> None:
    """后台执行重算；取消则直接终止，其余异常仅记录不抛出。"""
    try:
        async with db_manager.session_factory() as session:
            await recompute_derived(session, book_id)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception(f"后台 recompute_derived 失败 book_id={book_id}")
