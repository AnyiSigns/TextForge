"""角色模拟房间后端路由"""
import json

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from models.agent_memory import AgentMemory
from models.book import Character
from models.sim_room import SimBranch, SimMessage, SimParticipant, SimRoom
from pydantic import BaseModel, Field
from shared.database import db_manager
from shared.pagination import PageParams, PageResult
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.sim_rooms.graph import MAX_ROUNDS

from .auth import ws_authenticate
from .context_loader import load_room_context
from .orchestration import (
    _execute_round,
    _generate_branch,
    _generate_suggestions,
    _stream_llm_pieces,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/sim-rooms", tags=["角色模拟"])


class CreateRoomRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    name: str
    description: str | None = None
    location_id: int | None = Field(default=None, alias="locationId")
    user_character_id: int | None = Field(default=None, alias="userCharacterId", description="用户扮演的「我的身份」角色ID")
    participant_ids: list[int] = Field(default=[], alias="participantIds")
    participant_types: list[str] = Field(default=[], alias="participantTypes")
    related_event_ids: list[int] = Field(default=[], alias="relatedEventIds")
    related_foreshadowing_ids: list[int] = Field(default=[], alias="relatedForeshadowingIds")
    related_plot_thread_ids: list[int] = Field(default=[], alias="relatedPlotThreadIds")


class EndRoomRequest(BaseModel):
    generate_summary: bool = True


@router.get("/")
async def list_rooms(
    user_id: int = Depends(get_current),
    book_id: int | None = Query(default=None, alias="bookId"),
    page_params: PageParams = Depends(),
    session: AsyncSession = Depends(db_manager.get_db),
):
    stmt = select(SimRoom).where(SimRoom.user_id == user_id)
    count_stmt = select(func.count()).select_from(SimRoom).where(SimRoom.user_id == user_id)
    if book_id:
        stmt = stmt.where(SimRoom.book_id == book_id)
        count_stmt = count_stmt.where(SimRoom.book_id == book_id)
    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0
    stmt = stmt.order_by(SimRoom.updated_at.desc()).offset(page_params.offset).limit(page_params.limit)
    result = await session.execute(stmt)
    rooms = result.scalars().all()

    # 参与者数量：一次分组查询统计，避免异步会话中懒加载 relationship 触发 MissingGreenlet
    room_ids = [r.id for r in rooms]
    participant_counts: dict[int, int] = {}
    if room_ids:
        cnt_result = await session.execute(
            select(SimParticipant.room_id, func.count())
            .where(SimParticipant.room_id.in_(room_ids))
            .group_by(SimParticipant.room_id)
        )
        participant_counts = dict(cnt_result.all())

    return PageResult(
        items=[
            {
                "id": r.id, "bookId": r.book_id, "name": r.name,
                "description": r.description, "status": r.status,
                "locationId": r.location_id,
                "participantCount": participant_counts.get(r.id, 0),
                "roundCount": r.round_count,
                "createdAt": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rooms
        ],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


@router.post("/")
async def create_room(
    user_id: int = Depends(get_current),
    body: CreateRoomRequest | None = None,
    session: AsyncSession = Depends(db_manager.get_db),
):
    if not body:
        raise HTTPException(status_code=400, detail="缺少请求体")

    from models.book import Book
    book = await session.get(Book, body.book_id)
    if not book or book.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权访问该书籍")

    room = SimRoom(
        book_id=body.book_id, user_id=user_id, name=body.name,
        description=body.description,
        location_id=body.location_id,
        related_event_ids=body.related_event_ids,
        related_foreshadowing_ids=body.related_foreshadowing_ids,
        related_plot_thread_ids=body.related_plot_thread_ids,
    )
    session.add(room)
    await session.flush()

    for i, cid in enumerate(body.participant_ids):
        ptype = body.participant_types[i] if i < len(body.participant_types) else "character"
        label = f"角色{cid}"
        if ptype == "character":
            char = await session.get(Character, cid)
            label = char.name if char else f"角色{cid}"
        session.add(SimParticipant(
            room_id=room.id, entity_type=ptype, entity_id=cid,
            role_label=label, personality_override=None,
        ))

    # 用户扮演的「我的身份」角色（entity_type="user"），若未指定则回退为默认用户占位
    if body.user_character_id:
        uchar = await session.get(Character, body.user_character_id)
        ulabel = uchar.name if uchar else f"角色{body.user_character_id}"
        session.add(SimParticipant(
            room_id=room.id, entity_type="user", entity_id=body.user_character_id,
            role_label=ulabel, personality_override=None,
        ))
    else:
        session.add(SimParticipant(
            room_id=room.id, entity_type="user", entity_id=user_id, role_label="用户",
        ))

    await session.commit()
    return {"id": room.id, "name": room.name}


@router.get("/{room_id}")
async def get_room(
    room_id: int,
    user_id: int = Depends(get_current),
    session: AsyncSession = Depends(db_manager.get_db),
):
    room = await session.get(SimRoom, room_id)
    if not room or room.user_id != user_id:
        raise HTTPException(status_code=404, detail="房间不存在")
    # 显式查询参与者，避免异步会话懒加载 relationship 触发 MissingGreenlet
    participants = (await session.execute(
        select(SimParticipant).where(SimParticipant.room_id == room_id)
    )).scalars().all()
    participants = [{"id": p.id, "entityType": p.entity_type, "entityId": p.entity_id, "roleLabel": p.role_label, "personalityOverride": p.personality_override} for p in participants]
    msgs = (await session.execute(
        select(SimMessage).where(SimMessage.room_id == room_id).order_by(SimMessage.created_at)
    )).scalars().all()
    branches = (await session.execute(
        select(SimBranch).where(SimBranch.room_id == room_id).order_by(SimBranch.created_at)
    )).scalars().all()

    return {
        "room": {
            "id": room.id, "bookId": room.book_id, "name": room.name,
            "description": room.description, "status": room.status,
            "locationId": room.location_id,
            "relatedEventIds": room.related_event_ids,
            "relatedForeshadowingIds": room.related_foreshadowing_ids,
            "relatedPlotThreadIds": room.related_plot_thread_ids,
            "roundCount": room.round_count,
            "participants": participants,
            "messages": [{"id": m.id, "senderType": m.sender_type, "senderLabel": m.sender_label, "content": m.content, "messageType": m.message_type, "createdAt": m.created_at.isoformat() if m.created_at else ""} for m in msgs],
            "branches": [b.to_dict() for b in branches],
        }
    }


@router.delete("/{room_id}")
async def delete_room(
    room_id: int,
    user_id: int = Depends(get_current),
    session: AsyncSession = Depends(db_manager.get_db),
):
    room = await session.get(SimRoom, room_id)
    if not room or room.user_id != user_id:
        raise HTTPException(status_code=404, detail="房间不存在")

    # 清理该房间沉淀的角色记忆（source 前缀 sim_room:{room_id}:）
    memories = (await session.execute(
        select(AgentMemory).where(AgentMemory.source.like(f"sim_room:{room_id}:%"))
    )).scalars().all()
    for mem in memories:
        await session.delete(mem)

    # 参与者/消息/支线表外键均带 ondelete="CASCADE"，删房间即可级联清理
    await session.delete(room)
    await session.commit()
    return {"ok": True}


@router.websocket("/{room_id}/ws")
async def room_websocket(websocket: WebSocket, room_id: int, model_config: str | None = Query(default=None, alias="modelConfig")):
    """房间实时模拟 WebSocket：鉴权 → 上下文装载 → 回合循环（薄传输层）。"""
    parsed_model_config: dict = {}
    if model_config:
        try:
            import json as _json
            parsed_model_config = _json.loads(model_config) or {}
        except Exception:
            parsed_model_config = {}
    async with db_manager.session_factory() as db_session:
        room = await db_session.get(SimRoom, room_id)
        if not room:
            await websocket.close(code=4004, reason="房间不存在")
            return

    user_id = await ws_authenticate(websocket, room)
    if user_id is None:
        return

    await websocket.accept()

    ctx = await load_room_context(room_id, room, parsed_model_config)
    char_details = ctx["char_details"]
    setting_text = ctx["setting_text"]
    user_char_detail = ctx["user_char_detail"]
    recent_history = ctx["recent_history"]
    character_memories = ctx["character_memories"]
    round_count = ctx["round_count"]
    bridge = ctx["bridge"]
    my_role_label = ctx["my_role_label"]

    await websocket.send_text(json.dumps({"type": "connected", "roomId": room_id, "user_id": room.user_id, "userRoleLabel": my_role_label}, ensure_ascii=False))

    # 开局提示：新房间（无历史消息）时生成一段开场白并流式推送，随后推送建议卡片供用户选择
    if not recent_history:
        try:
            chars_desc = "\n".join(
                f"- {c['role_label']}（{c.get('description', '')[:200]}）"
                for c in char_details if c.get("entity_type") != "user"
            ) or "（暂无角色）"
            opening_prompt = f"""你是小说模拟的导演。请为一场新的角色模拟写一段简短的开场白。

场景设定：{setting_text}
房间角色：
{chars_desc}

请用 80-150 字描写当前场景与氛围，自然引出在场角色，并在结尾以导演口吻抛出一个可以立即开始的剧情钩子或引导问题。
严禁出现任何服务用语、AI 身份表述或跳出作品世界观的说明（如"作为AI""很高兴为您服务""有什么可以帮您"等），保持完全沉浸的小说叙事。只输出开场白内容。"""
            opening_text = ""
            llm = ModelFactory(parsed_model_config or {})
            await websocket.send_text(json.dumps({"type": "stream_start"}, ensure_ascii=False))
            async for piece in _stream_llm_pieces(llm, opening_prompt):
                opening_text += piece
                await websocket.send_text(json.dumps({"type": "stream_token", "token": piece, "senderLabel": "导演"}, ensure_ascii=False))
            if opening_text:
                async with db_manager.session_factory() as ss:
                    sm0 = SimMessage(room_id=room_id, sender_type="system", sender_label="导演", content=opening_text, message_type="narration")
                    ss.add(sm0)
                    await ss.commit()
                recent_history.append(f"[导演][narration] {opening_text[:200]}")
            await websocket.send_text(json.dumps({"type": "turn_done", "roundCount": round_count}, ensure_ascii=False))
            try:
                suggestions = await _generate_suggestions(recent_history, char_details, setting_text, "director", parsed_model_config)
                if suggestions:
                    await websocket.send_text(json.dumps({"type": "suggestions", "items": suggestions}, ensure_ascii=False))
            except Exception as exc:
                logger.warning(f"生成开局建议异常: {exc}")
        except Exception as exc:
            logger.exception(f"开局提示生成失败: {exc}")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "chat")

            if msg_type == "end":
                summary = ""
                if msg.get("generateSummary", True):
                    try:
                        llm = ModelFactory(parsed_model_config or {})
                        result = await llm.main.ainvoke(
                            "请为以下角色模拟对话生成一段简洁摘要（200字内）：\n\n" +
                            "\n".join(recent_history[-10:])
                        )
                        summary = result.content if hasattr(result, "content") else str(result)
                    except Exception:
                        summary = "对话已结束"
                await websocket.send_text(json.dumps({"type": "end", "summary": summary, "roundCount": round_count}, ensure_ascii=False))

                # 保存最终摘要到房间
                async with db_manager.session_factory() as ss:
                    r = await ss.get(SimRoom, room_id)
                    if r:
                        r.status = "archived"
                        r.round_count = round_count
                        if summary:
                            r.summary = summary
                        await ss.commit()
                break

            if msg_type == "branch":
                branch_type = str(msg.get("branchType", "plot-thread"))
                try:
                    branch = await _generate_branch(
                        room_id=room_id,
                        branch_type=branch_type,
                        recent_history=recent_history,
                        char_details=char_details,
                        setting_text=setting_text,
                        related_event_ids=room.related_event_ids,
                        related_foreshadowing_ids=room.related_foreshadowing_ids,
                        related_plot_thread_ids=room.related_plot_thread_ids,
                        location_id=room.location_id,
                        model_config=parsed_model_config,
                        character_memories=character_memories,
                        user_char=user_char_detail,
                    )
                    await websocket.send_text(json.dumps({"type": "branch_created", "branch": branch}, ensure_ascii=False))
                except Exception as exc:
                    logger.exception(f"支线生成失败: {exc}")
                    await websocket.send_text(json.dumps({"type": "error", "message": f"支线生成失败：{exc}"}, ensure_ascii=False))
                continue

            if msg_type == "auto_advance":
                # AI 自动推进：以导演身份连续驱动几轮对话，供角色支线工作台使用
                turns = max(1, min(int(msg.get("turns", 2)), 5))
                for _ in range(turns):
                    if round_count >= MAX_ROUNDS:
                        break
                    round_count, should_end, _ = await _execute_round(
                        websocket, room_id, round_count,
                        "（导演自动推进，请自然地延续剧情场景，推进剧情发展）", "director",
                        recent_history, character_memories, char_details,
                        setting_text, parsed_model_config, bridge,
                    )
                    if should_end:
                        break
                try:
                    suggestions = await _generate_suggestions(recent_history, char_details, setting_text, "director", parsed_model_config)
                    if suggestions:
                        await websocket.send_text(json.dumps({"type": "suggestions", "items": suggestions}, ensure_ascii=False))
                except Exception as exc:
                    logger.warning(f"生成推荐建议异常: {exc}")
                continue

            if msg_type != "chat":
                continue

            user_content = msg.get("content", "")
            speak_as = msg.get("speakAs", "director")

            # 保存用户消息
            async with db_manager.session_factory() as ss:
                sm = SimMessage(room_id=room_id, sender_type="user", sender_label=speak_as, content=user_content, message_type="dialogue")
                ss.add(sm)
                await ss.commit()

            # 用户发言进入上下文，格式与重连重建的 [label][type] 保持一致
            recent_history.append(f"[{speak_as}][dialogue] {user_content[:200]}")

            # 跑一轮图（流式）
            round_count, should_end, _ = await _execute_round(
                websocket, room_id, round_count, user_content, speak_as,
                recent_history, character_memories, char_details,
                setting_text, parsed_model_config, bridge,
            )

            # 生成 2 条下一步推荐建议，供前端卡片点选
            try:
                suggestions = await _generate_suggestions(recent_history, char_details, setting_text, speak_as, parsed_model_config)
                if suggestions:
                    await websocket.send_text(json.dumps({"type": "suggestions", "items": suggestions}, ensure_ascii=False))
            except Exception as exc:
                logger.warning(f"生成推荐建议异常: {exc}")

            if should_end:
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception(f"WebSocket异常: {exc}")
