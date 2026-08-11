"""剧情流数据访问层 — 会话与节点的 CRUD。

所有查询均带 user_id 归属校验；节点与会话的对外序列化统一走
to_dict / to_node_dict，避免字段漂移。
"""
from models.story_flow import StoryFlow, StoryFlowNode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def flow_to_dict(flow: StoryFlow) -> dict:
    """序列化剧情流会话为 camelCase 字典。"""
    return {
        "id": flow.id,
        "bookId": flow.book_id,
        "chapterId": flow.chapter_id,
        "status": flow.status,
        "anchorEventIds": flow.anchor_event_ids or [],
        "currentEventIndex": flow.current_event_index,
        "viewCharacterId": flow.view_character_id,
        "roundCount": flow.round_count,
        "summary": flow.summary,
        "createdAt": flow.created_at.isoformat() if flow.created_at else "",
        "updatedAt": flow.updated_at.isoformat() if flow.updated_at else "",
    }


def node_to_dict(node: StoryFlowNode) -> dict:
    """序列化剧情流节点为 camelCase 字典。"""
    return {
        "id": node.id,
        "seq": node.seq,
        "anchoredEventId": node.anchored_event_id,
        "title": node.title,
        "narration": node.narration,
        "options": node.options or [],
        "chosenOption": node.chosen_option,
        "locationName": node.location_name,
        "characterNames": node.character_names or [],
        "createdAt": node.created_at.isoformat() if node.created_at else "",
    }


async def get_flow(session: AsyncSession, flow_id: int, user_id: int) -> StoryFlow | None:
    """按 id + user_id 查询剧情流会话。"""
    stmt = select(StoryFlow).where(
        StoryFlow.id == flow_id, StoryFlow.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_flow(
    session: AsyncSession, book_id: int, chapter_id: int, user_id: int
) -> StoryFlow | None:
    """查询某书某章节下未完成的剧情流，取 updated_at 最新一条。

    配合创建接口的幂等逻辑，保证多标签页并发打开时只有一个 active 流。
    """
    stmt = (
        select(StoryFlow)
        .where(
            StoryFlow.book_id == book_id,
            StoryFlow.chapter_id == chapter_id,
            StoryFlow.user_id == user_id,
            StoryFlow.status == "active",
        )
        .order_by(StoryFlow.updated_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_flows(
    session: AsyncSession,
    user_id: int,
    book_id: int | None = None,
    chapter_id: int | None = None,
    status: str | None = None,
) -> list[StoryFlow]:
    """查询剧情流会话列表（可按 book/chapter/status 过滤）。"""
    stmt = select(StoryFlow).where(StoryFlow.user_id == user_id)
    if book_id is not None:
        stmt = stmt.where(StoryFlow.book_id == book_id)
    if chapter_id is not None:
        stmt = stmt.where(StoryFlow.chapter_id == chapter_id)
    if status:
        stmt = stmt.where(StoryFlow.status == status)
    stmt = stmt.order_by(StoryFlow.updated_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_nodes(session: AsyncSession, flow_id: int) -> list[StoryFlowNode]:
    """查询剧情流全部节点，按 seq 升序。"""
    stmt = (
        select(StoryFlowNode)
        .where(StoryFlowNode.flow_id == flow_id)
        .order_by(StoryFlowNode.seq)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_last_node(
    session: AsyncSession, flow_id: int
) -> StoryFlowNode | None:
    """查询剧情流最后一个节点。"""
    stmt = (
        select(StoryFlowNode)
        .where(StoryFlowNode.flow_id == flow_id)
        .order_by(StoryFlowNode.seq.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_node_by_seq(
    session: AsyncSession, flow_id: int, seq: int
) -> StoryFlowNode | None:
    """按 (flow_id, seq) 查询节点（并发重复插入兜底复用）。"""
    stmt = select(StoryFlowNode).where(
        StoryFlowNode.flow_id == flow_id, StoryFlowNode.seq == seq
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_flow(
    session: AsyncSession,
    book_id: int,
    chapter_id: int,
    user_id: int,
    anchor_event_ids: list[int],
    current_event_index: int,
    view_character_id: int | None,
) -> StoryFlow:
    """新建剧情流会话（未提交，由调用方 commit）。"""
    flow = StoryFlow(
        book_id=book_id,
        chapter_id=chapter_id,
        user_id=user_id,
        status="active",
        anchor_event_ids=anchor_event_ids,
        current_event_index=current_event_index,
        view_character_id=view_character_id,
        round_count=0,
    )
    session.add(flow)
    await session.flush()
    return flow


async def add_node(
    session: AsyncSession,
    flow_id: int,
    seq: int,
    anchored_event_id: int | None,
    title: str,
    narration: str,
    options: list[dict],
    location_name: str | None,
    character_names: list[str],
) -> StoryFlowNode:
    """新增剧情流节点（未提交，由调用方 commit）。"""
    node = StoryFlowNode(
        flow_id=flow_id,
        seq=seq,
        anchored_event_id=anchored_event_id,
        title=title,
        narration=narration,
        options=options,
        location_name=location_name,
        character_names=character_names,
    )
    session.add(node)
    await session.flush()
    return node


async def delete_flow(session: AsyncSession, flow: StoryFlow) -> None:
    """删除剧情流会话（节点级联删除，未提交）。"""
    await session.delete(flow)
