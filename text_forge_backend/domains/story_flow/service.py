"""剧情流 — 业务服务层（流式执行与生命周期）。

负责：会话创建/推进/结束、两段式流式生成、幂等与并发兜底、摘要生成与回退。
场景上下文装配（锚点解析/书籍上下文/事件描述/决策链历史/节点元数据）已拆至
scene_context.py；本模块保留旧导入路径（测试/路由沿用 `service.<symbol>`）。
"""
from collections.abc import AsyncGenerator

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import HumanMessage, SystemMessage
from models.book import Book, Chapter, Character
from models.story_flow import StoryFlow
from shared.utils import redact_sensitive
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from . import repository as repo
from .prompts import (
    build_scene_prompt,
    build_summary_prompt,
    fallback_summary_from_nodes,
)
from .scene_context import (
    DEFAULT_OPTIONS,
    HISTORY_WINDOW,
    MARKER,
    MAX_SCENES_PER_EVENT,
    MORE_MARKER,
    _build_book_context,
    _build_decision_history,
    _build_event_desc,
    _derive_node_metadata,
    _get_character_name,
    _load_anchor_events,
    _parse_options,
    _resolve_anchor,
    _split_two_phase,
)

logger = get_logger(__name__)

# 自由推演幕数上限兜底：与 sim_rooms MAX_ROUNDS=30 对齐，防止无限 advance。
# 达到上限后下一次推进直接收束（标记 completed），与事件模式收尾语义一致。
MAX_SCENES_PER_FLOW = 30

__all__ = [
    "DEFAULT_OPTIONS",
    "HISTORY_WINDOW",
    "MARKER",
    "MAX_SCENES_PER_EVENT",
    "MORE_MARKER",
    "_astream_text",
    "_build_book_context",
    "_build_decision_history",
    "_build_event_desc",
    "_derive_node_metadata",
    "_generate_scene_node",
    "_get_character_name",
    "_load_anchor_events",
    "_make_llm",
    "_parse_options",
    "_resolve_anchor",
    "_split_two_phase",
    "complete_flow",
    "repo",
    "stream_advance_flow",
    "stream_create_flow",
    "validate_view_character",
]


async def _make_llm(model_config: dict):
    """构建 main 档 LLM 实例（配置失败时回退默认）。"""
    try:
        factory = ModelFactory(model_config)
        return factory.main
    except Exception as exc:
        logger.warning(f"story_flow 模型初始化失败，使用默认配置: {exc}")
        return ModelFactory({}).main


async def _astream_text(llm, messages: list) -> AsyncGenerator[str, None]:
    """流式迭代 LLM 输出文本片段，流式接口不可用时回退一次性生成。"""
    try:
        async for chunk in llm.astream(messages):
            piece = chunk.content if hasattr(chunk, "content") else str(chunk)
            if piece:
                yield piece
    except Exception:
        logger.warning("[story_flow] LLM 流式接口不可用，回退一次性生成", exc_info=True)
        raw = await llm.ainvoke(messages)
        text = raw.content if hasattr(raw, "content") else str(raw)
        if text:
            yield text


async def _generate_scene_node(
    session: AsyncSession,
    flow: StoryFlow,
    book: Book,
    chapter: Chapter,
    model_config: dict,
    seq: int,
    index: int,
    view_character_id: int | None,
    user_input: str | None = None,
    closing: bool = False,
) -> AsyncGenerator[dict, None]:
    """生成一个场景节点（两段式真流式），落库并推进会话状态。

    事件模式下由 LLM 输出 `###MORE###` 标记决定是否续幕（每事件至多 3 幕，
    MAX_SCENES_PER_EVENT 兜底强制收束）；收尾幕（closing=True）生成后会话
    立即置为 completed。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（当前事务内已加锁/或本请求新建）。
        book: 书籍。
        chapter: 章节。
        model_config: 用户模型配置。
        seq: 新节点序号。
        index: 待解析的锚点事件下标（-1 表示实时/收尾模式）。
        view_character_id: 视角角色 ID。
        user_input: 用户自定义输入原文（可为 None）。
        closing: 是否收尾幕（事件全部推演完后追加的自由收束幕）。

    Yields:
        SSE 事件字典：scene_stream / scene_done / done / error。
    """
    event, resolved_index = await _resolve_anchor(session, flow, index)
    anchor_ids = flow.anchor_event_ids or []
    view_name = await _get_character_name(session, view_character_id)
    event_character_names = (
        [
            c.name
            for c in (
                await session.execute(
                    select(Character).where(Character.id.in_(event.character_ids))
                )
            ).scalars().all()
        ]
        if event and event.character_ids
        else []
    )

    nodes = await repo.get_nodes(session, flow.id)
    event_mode = resolved_index >= 0
    if event_mode:
        scene_index = 1 + sum(
            1 for n in nodes if n.anchored_event_id == event.id
        )
    else:
        scene_index = 0
    max_reached = event_mode and scene_index >= MAX_SCENES_PER_EVENT

    if closing:
        stage_label = "收尾幕"
        last_event = True
    elif event_mode:
        stage_label = f"事件 {resolved_index + 1} / {len(anchor_ids)} · 第 {scene_index} 幕"
        last_event = resolved_index == len(anchor_ids) - 1 and max_reached
    else:
        stage_label = f"第 {seq} 幕"
        last_event = False

    event_desc = await _build_event_desc(session, event, character_names=event_character_names)
    book_context = await _build_book_context(session, book, chapter)
    history = _build_decision_history(nodes)

    prompt = build_scene_prompt(
        book_title=book.title,
        chapter_title=chapter.title,
        chapter_summary=chapter.summary or "",
        event_desc=f"{book_context}\n\n{event_desc}",
        decision_history=history,
        stage_label=stage_label,
        view_character_name=view_name,
        user_input=user_input,
        last_event=last_event,
        closing=closing,
        scene_index=scene_index,
    )
    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content="请开始生成本幕叙事与选项。"),
    ]

    # 在长时间 LLM 流式生成前结束只读事务，避免事务/连接被长时间占用
    await session.commit()

    llm = await _make_llm(model_config)

    # 真流式：LLM token 到达即转发 scene_stream，不做整段收集后补发
    full_text = ""
    emitted = 0
    seen_marker = False
    tail = ""
    try:
        async for piece in _astream_text(llm, messages):
            full_text += piece
            if not seen_marker:
                idx = full_text.find(MARKER)
                if idx >= 0:
                    seen_marker = True
                    tail = full_text[idx + len(MARKER):]
                    forward = full_text[:idx][emitted:]
                    if forward:
                        yield {"type": "scene_stream", "token": forward}
                    emitted = len(full_text[:idx])
                else:
                    forward = full_text[emitted:]
                    if forward:
                        yield {"type": "scene_stream", "token": forward}
                    emitted = len(full_text)
            else:
                tail += piece
    except Exception as exc:
        logger.exception("[story_flow] 场景生成 LLM 调用失败")
        yield {"type": "error", "message": f"场景生成失败: {redact_sensitive(str(exc)[:100])}"}
        return

    if not seen_marker:
        narration, options = _split_two_phase(full_text)
    else:
        narration = full_text[: full_text.find(MARKER)].strip() or "（本幕叙事为空）"
        options = _parse_options(tail)

    # AI 决定本事件是否续幕：尾区含 ###MORE### 且未达幕数上限（第 3 幕强制收束）
    more = event_mode and not max_reached and MORE_MARKER in tail

    meta = await _derive_node_metadata(
        session, event, seq, view_character_id, character_names=event_character_names
    )
    try:
        node = await repo.add_node(
            session=session,
            flow_id=flow.id,
            seq=seq,
            anchored_event_id=event.id if event else None,
            title=meta["title"],
            narration=narration,
            options=options,
            location_name=meta["location_name"],
            character_names=meta["character_names"],
        )
        flow.round_count += 1
        if closing:
            # 收尾幕：事件全部推演完后的自由收束幕，生成完即完成
            flow.current_event_index = len(anchor_ids)
            flow.status = "completed"
        elif event_mode:
            # 续幕则停留在当前事件，否则推进到下一事件（可能 == len 触发收尾）
            flow.current_event_index = resolved_index if more else resolved_index + 1
        else:
            flow.current_event_index = -1
        await session.commit()
    except IntegrityError:
        # 并发重复插入（(flow_id, seq) 联合唯一约束兜底）：回滚后取已存在的节点
        logger.warning(f"[story_flow] 并发重复插入节点 flow={flow.id} seq={seq}，回退复用已有节点")
        await session.rollback()
        existing = await repo.get_node_by_seq(session, flow.id, seq)
        if existing:
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(existing),
                "completed": False,
                "flow_id": flow.id,
                "anchor_event_ids": flow.anchor_event_ids or [],
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        yield {"type": "error", "message": "场景节点保存失败，请重试"}
        return
    except Exception:
        logger.exception("[story_flow] 场景节点落库失败")
        await session.rollback()
        yield {"type": "error", "message": "场景节点保存失败，请重试"}
        return

    yield {
        "type": "scene_done",
        "node": repo.node_to_dict(node),
        "completed": closing,
        "flow_id": flow.id,
        "anchor_event_ids": flow.anchor_event_ids or [],
        "current_event_index": flow.current_event_index,
    }
    yield {"type": "done"}


async def stream_create_flow(
    session: AsyncSession,
    book: Book,
    chapter: Chapter,
    view_character_id: int | None,
    user_id: int,
    model_config: dict,
) -> AsyncGenerator[dict, None]:
    """创建剧情流会话并生成首场景（幂等：已有 active 流则复用）。

    已有 active 流且有节点 → 直接回放最后节点的 scene_done + done；
    已有 active 流但无节点（上次首场景生成失败遗留）→ 重新生成首场景。

    Args:
        session: 数据库会话。
        book: 书籍（router 已校验归属）。
        chapter: 章节。
        view_character_id: 视角角色 ID（可为 None）。
        user_id: 用户 ID。
        model_config: 用户模型配置。

    Yields:
        SSE 事件字典。
    """
    existing = await repo.get_active_flow(session, book.id, chapter.id, user_id)
    if existing:
        existing_nodes = await repo.get_nodes(session, existing.id)
        if existing_nodes:
            last = existing_nodes[-1]
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(last),
                "completed": existing.status == "completed",
                "flow_id": existing.id,
                "anchor_event_ids": existing.anchor_event_ids or [],
                "current_event_index": existing.current_event_index,
            }
            yield {"type": "done"}
            return
        flow = existing
    else:
        anchors = await _load_anchor_events(session, chapter.id)
        anchor_ids = [e.id for e in anchors]
        flow = await repo.create_flow(
            session=session,
            book_id=book.id,
            chapter_id=chapter.id,
            user_id=user_id,
            anchor_event_ids=anchor_ids,
            current_event_index=0 if anchor_ids else -1,
            view_character_id=view_character_id,
        )
        try:
            await session.commit()
        except IntegrityError:
            # 并发创建竞态：另一请求已插入 active 流（部分唯一索引兜底），
            # 回滚后复用已有流，避免出现两条 active 流
            await session.rollback()
            existing = await repo.get_active_flow(session, book.id, chapter.id, user_id)
            if existing:
                flow = existing
            else:
                logger.exception("[story_flow] 创建会话失败（并发兜底未命中）")
                yield {"type": "error", "message": "创建剧情流失败，请重试"}
                return
        except Exception:
            logger.exception("[story_flow] 创建会话失败")
            await session.rollback()
            yield {"type": "error", "message": "创建剧情流失败，请重试"}
            return

    async for event in _generate_scene_node(
        session=session,
        flow=flow,
        book=book,
        chapter=chapter,
        model_config=model_config,
        seq=1,
        index=flow.current_event_index,
        view_character_id=flow.view_character_id,
    ):
        yield event


async def stream_advance_flow(
    session: AsyncSession,
    flow: StoryFlow,
    chosen_option_text: str,
    model_config: dict,
    book: Book | None = None,
    chapter: Chapter | None = None,
) -> AsyncGenerator[dict, None]:
    """推进剧情流（写选择 → 幂等检查 → 序列末尾判定 → 生成下一场景）。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（router 已校验归属与 active 状态）。
        chosen_option_text: 用户选择的选项原文（trim 后）。
        model_config: 用户模型配置。
        book: 书籍（懒加载用，可为 None 时内部查询）。
        chapter: 章节（懒加载用，可为 None 时内部查询）。

    Yields:
        SSE 事件字典。
    """
    # ① 幂等检查：最后节点已有后续节点（上一步已生成）→ 直接回放，不重复生成，
    #    也不改写选择（防止把上次的选择文本误写到结果节点上）
    last_node = await repo.get_last_node(session, flow.id)
    if last_node:
        next_node = await repo.get_node_by_seq(session, flow.id, last_node.seq + 1)
        if next_node:
            yield {
                "type": "scene_done",
                "node": repo.node_to_dict(next_node),
                "completed": flow.status == "completed",
                "flow_id": flow.id,
                "anchor_event_ids": flow.anchor_event_ids or [],
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        # ② 写最后节点 chosen_option（若未写；已写则保留原值，保证重试幂等）
        if last_node.chosen_option:
            # 已写入不同选项（异常并发）：拒绝覆盖，避免决策链与落库不一致
            if last_node.chosen_option != chosen_option_text:
                yield {"type": "error", "message": "选项已确定，请刷新后重试"}
                return
            # 已写入相同选项：视为重试，继续生成下一节点（幂等）
        else:
            last_node.chosen_option = chosen_option_text
            await session.commit()

    anchor_ids = flow.anchor_event_ids or []

    next_seq = (last_node.seq + 1) if last_node else 1
    if book is None or chapter is None:
        _book = await session.get(Book, flow.book_id)
        _chapter = await session.get(Chapter, flow.chapter_id)
        book = book or _book
        chapter = chapter or _chapter
        if book is None or chapter is None:
            yield {"type": "error", "message": "书籍或章节不存在"}
            return

    # ③ 事件模式：全部事件推演完 → 先追加一幕自由收尾幕（closing）；
    #    收尾幕已生成（最后节点无锚点）→ 结束推演
    if anchor_ids and flow.current_event_index >= len(anchor_ids):
        if last_node and last_node.anchored_event_id is None:
            flow.status = "completed"
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                yield {"type": "error", "message": "保存状态失败，请重试"}
                return
            yield {
                "type": "scene_done",
                "node": None,
                "completed": True,
                "flow_id": flow.id,
                "anchor_event_ids": anchor_ids,
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        # 并发兜底：生成期间被 complete 结束则不再追加收尾幕
        if flow.status == "completed":
            yield {
                "type": "scene_done",
                "node": None,
                "completed": True,
                "flow_id": flow.id,
                "anchor_event_ids": anchor_ids,
                "current_event_index": flow.current_event_index,
            }
            yield {"type": "done"}
            return
        async for event in _generate_scene_node(
            session=session,
            flow=flow,
            book=book,
            chapter=chapter,
            model_config=model_config,
            seq=next_seq,
            index=-1,
            view_character_id=flow.view_character_id,
            closing=True,
        ):
            yield event
        return

    # ④ 生成下一幕：事件模式停留在当前事件（AI 以 ###MORE### 决定是否续幕，
    #    幕数上限兜底强制收束），实时模式 index=-1
    #    并发兜底：流式生成期间被 complete_flow 结束（流式时结束按钮已前端禁用，
    #    多端/直调仍可能发生）→ 不再追加节点，避免 completed 流出现新节点。
    if flow.status == "completed":
        yield {
            "type": "scene_done",
            "node": None,
            "completed": True,
            "flow_id": flow.id,
            "anchor_event_ids": anchor_ids,
            "current_event_index": flow.current_event_index,
        }
        yield {"type": "done"}
        return

    # 自由推演幕数上限：已达 MAX_SCENES_PER_FLOW → 收束完成，不再生成
    if not anchor_ids and last_node and last_node.seq >= MAX_SCENES_PER_FLOW:
        flow.status = "completed"
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            yield {"type": "error", "message": "保存状态失败，请重试"}
            return
        yield {
            "type": "scene_done",
            "node": None,
            "completed": True,
            "flow_id": flow.id,
            "anchor_event_ids": anchor_ids,
            "current_event_index": flow.current_event_index,
        }
        yield {"type": "done"}
        return

    async for event in _generate_scene_node(
        session=session,
        flow=flow,
        book=book,
        chapter=chapter,
        model_config=model_config,
        seq=next_seq,
        index=flow.current_event_index if anchor_ids else -1,
        view_character_id=flow.view_character_id,
    ):
        yield event


async def complete_flow(
    session: AsyncSession,
    flow: StoryFlow,
    model_config: dict,
) -> str:
    """结束剧情流并生成推演摘要（幂等；LLM 失败回退决策链文本拼接）。

    Args:
        session: 数据库会话。
        flow: 剧情流会话（router 已校验归属）。
        model_config: 用户模型配置。

    Returns:
        推演摘要（可为空串）。
    """
    if flow.status == "completed":
        return flow.summary or ""

    nodes = await repo.get_nodes(session, flow.id)
    summary = ""
    if nodes:
        decision_chain_text = "\n".join(
            f"{n.title}：{n.chosen_option}" for n in nodes if n.chosen_option
        )
        all_narrations = "\n\n".join(
            f"【第{n.seq}幕·{n.title}】\n{n.narration}" for n in nodes
        )
        book_title = ""
        chapter_title = ""
        book = await session.get(Book, flow.book_id)
        if book:
            book_title = book.title
        chapter = await session.get(Chapter, flow.chapter_id)
        if chapter:
            chapter_title = chapter.title
        try:
            llm = await _make_llm(model_config)
            prompt = build_summary_prompt(
                book_title=book_title,
                chapter_title=chapter_title,
                decision_chain_text=decision_chain_text,
                all_narrations=all_narrations,
            )
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content="请生成推演摘要。"),
            ]
            raw = await llm.ainvoke(messages)
            text = raw.content if hasattr(raw, "content") else str(raw)
            summary = (text or "").strip()
        except Exception as exc:
            logger.warning(f"[story_flow] 摘要生成失败，回退决策链拼接: {exc}")
            summary = fallback_summary_from_nodes(nodes)
        if not summary:
            summary = fallback_summary_from_nodes(nodes)

    flow.status = "completed"
    flow.summary = summary
    try:
        await session.commit()
    except Exception:
        logger.exception("[story_flow] 结束剧情流失败")
        await session.rollback()
    return summary


async def validate_view_character(
    session: AsyncSession, character_id: int, book_id: int
) -> bool:
    """校验视角角色存在且属于本书。

    Args:
        session: 数据库会话。
        character_id: 角色 ID。
        book_id: 书籍 ID。

    Returns:
        是否合法。
    """
    char = await session.get(Character, character_id)
    return bool(char and char.book_id == book_id)
