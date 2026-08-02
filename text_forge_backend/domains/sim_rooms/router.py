"""角色模拟房间后端路由"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from config.logging import get_logger

logger = get_logger(__name__)
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from core.model_factory import ModelFactory
from core.security import verify_token
from domains.sim_rooms.graph import build_sim_director_graph, MAX_ROUNDS
from models.agent_memory import AgentMemory
from models.book import Character, Location
from models.sim_room import SimBranch, SimMessage, SimParticipant, SimRoom
from shared.database import db_manager
from shared.pagination import PageParams, PageResult

router = APIRouter(prefix="/sim-rooms", tags=["角色模拟"])


class CreateRoomRequest(BaseModel):
    book_id: int = Field(alias="bookId")
    name: str
    description: str | None = None
    setting: str | None = None
    location_id: int | None = Field(default=None, alias="locationId")
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
    return PageResult(
        items=[
            {
                "id": r.id, "bookId": r.book_id, "name": r.name,
                "description": r.description, "status": r.status,
                "locationId": r.location_id,
                "participantCount": len(r.participants),
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
        description=body.description, setting=body.setting,
        location_id=body.location_id,
        related_event_ids=body.related_event_ids,
        related_foreshadowing_ids=body.related_foreshadowing_ids,
        related_plot_thread_ids=body.related_plot_thread_ids,
    )
    session.add(room)
    await session.flush()

    for i, cid in enumerate(body.participant_ids):
        ptype = body.participant_types[i] if i < len(body.participant_types) else "character"
        label = "用户"
        personality = None
        if ptype == "character":
            char = await session.get(Character, cid)
            label = char.name if char else f"角色{cid}"
        session.add(SimParticipant(
            room_id=room.id, entity_type=ptype, entity_id=cid,
            role_label=label, personality_override=personality,
        ))

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
    participants = [{"id": p.id, "entityType": p.entity_type, "entityId": p.entity_id, "roleLabel": p.role_label, "personalityOverride": p.personality_override} for p in room.participants]
    msgs = (await session.execute(
        select(SimMessage).where(SimMessage.room_id == room_id).order_by(SimMessage.created_at)
    )).scalars().all()

    return {
        "room": {
            "id": room.id, "bookId": room.book_id, "name": room.name,
            "description": room.description, "status": room.status,
            "setting": room.setting, "locationId": room.location_id,
            "relatedEventIds": room.related_event_ids,
            "relatedForeshadowingIds": room.related_foreshadowing_ids,
            "relatedPlotThreadIds": room.related_plot_thread_ids,
            "roundCount": room.round_count,
            "participants": participants,
            "messages": [{"id": m.id, "senderType": m.sender_type, "senderLabel": m.sender_label, "content": m.content, "messageType": m.message_type, "createdAt": m.created_at.isoformat() if m.created_at else ""} for m in msgs],
        }
    }


@router.websocket("/{room_id}/ws")
async def room_websocket(websocket: WebSocket, room_id: int):
    async with db_manager.session_factory() as db_session:
        room = await db_session.get(SimRoom, room_id)
        if not room:
            await websocket.close(code=4004, reason="房间不存在")
            return

        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
            payload = verify_token(token)
            if not payload:
                await websocket.close(code=4003)
                return
            token_user_id = int(payload.get("sub", 0))
            if token_user_id != room.user_id:
                await websocket.close(code=4003)
                return
        else:
            await websocket.close(code=4003)
            return

    await websocket.accept()

    # 构造角色详情 + 场景设定
    char_details: list[dict] = []
    setting_text = room.setting or "自由场景"

    async with db_manager.session_factory() as s:
        if room.location_id:
            loc = await s.get(Location, room.location_id)
            if loc:
                setting_text += f" | 地点：{loc.name} · {loc.description or ''}"

        participants = (await s.execute(
            select(SimParticipant).where(SimParticipant.room_id == room_id)
        )).scalars().all()

        for p in participants:
            if p.entity_type == "user":
                continue
            detail = {"role_label": p.role_label, "entity_type": p.entity_type, "entity_id": p.entity_id, "personality_override": p.personality_override, "description": ""}
            if p.entity_type == "character" and p.entity_id:
                char = await s.get(Character, p.entity_id)
                if char:
                    detail["description"] = char.description or ""
            char_details.append(detail)

        # 现有消息列表
        existing_msgs = (await s.execute(
            select(SimMessage).where(SimMessage.room_id == room_id).order_by(SimMessage.created_at)
        )).scalars().all()

    recent_history: list[str] = []
    for m in existing_msgs[-10:]:
        recent_history.append(f"[{m.sender_label}][{m.message_type}] {m.content[:200]}")

    # 加载角色记忆
    character_memories: dict[str, str] = {}
    async with db_manager.session_factory() as s:
        for c in char_details:
            if c.get("entity_id"):
                source = f"sim_room:{room_id}:char:{c['entity_id']}"
                mem_result = await s.execute(
                    select(AgentMemory).where(AgentMemory.source == source)
                )
                mem = mem_result.scalar_one_or_none()
                if mem:
                    character_memories[c["role_label"]] = mem.content or ""

    round_count = 0

    async def _execute_sql(stmt):
        async with db_manager.session_factory() as ss:
            result = await ss.execute(stmt)
            return result

    bridge = {"execute_sql": _execute_sql, "room_id": room_id, "character_details": char_details, "user_id": room.user_id}
    graph = build_sim_director_graph(bridge)

    await websocket.send_text(json.dumps({"type": "connected", "roomId": room_id, "user_id": room.user_id}, ensure_ascii=False))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "chat")

            if msg_type == "end":
                summary = ""
                if msg.get("generateSummary", True):
                    try:
                        llm = ModelFactory({})
                        result = await llm.main.ainvoke(
                            f"请为以下角色模拟对话生成一段简洁摘要（200字内）：\n\n" +
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
                        if summary:
                            r.summary = summary
                        await ss.commit()
                break

            if msg_type != "chat":
                continue

            user_content = msg.get("content", "")
            speak_as = msg.get("speakAs", "director")

            # 保存用户消息
            async with db_manager.session_factory() as ss:
                sm = SimMessage(room_id=room_id, sender_type="user", sender_label=speak_as, content=user_content, message_type="dialogue")
                ss.add(sm)
                await ss.commit()

            await websocket.send_text(json.dumps({"type": "user_msg", "senderLabel": speak_as, "content": user_content}, ensure_ascii=False))

            # 跑一轮图
            state = {
                "room_id": room_id,
                "round_count": round_count,
                "should_end": False,
                "last_user_input": user_content,
                "speak_as": speak_as,
                "room_setting": setting_text,
                "character_details": char_details,
                "character_memories": character_memories,
                "recent_history": recent_history[-10:],
                "director_decision": None,
                "character_outputs": {},
                "scene_output": None,
                "final_output": "",
            }

            try:
                result = await graph.ainvoke(state)
            except Exception as exc:
                logger.exception(f"生成失败: {exc}")
                await websocket.send_text(json.dumps({"type": "error", "message": f"生成失败：{exc}"}, ensure_ascii=False))
                continue

            round_count += 1

            # 更新记忆
            character_memories = {**character_memories, **result.get("character_memories", {})}

            final_output = result.get("final_output", "") or ""
            if not final_output:
                final_output = "\n".join(f"{k}：{v}" for k, v in result.get("character_outputs", {}).items())

            # 逐 token 流式输出
            async with db_manager.session_factory() as ss:
                sm2 = SimMessage(room_id=room_id, sender_type="system", sender_label="AI", content=final_output, message_type="narration")
                ss.add(sm2)
                await ss.commit()

            # 按词批量流式输出（避免逐字发送导致浏览器卡顿）
            words = final_output.split()
            batch: list[str] = []
            for w in words:
                batch.append(w)
                if len(batch) >= 3:
                    await websocket.send_text(json.dumps({"type": "stream_token", "token": " ".join(batch) + " "}, ensure_ascii=False))
                    batch = []
            if batch:
                await websocket.send_text(json.dumps({"type": "stream_token", "token": " ".join(batch)}, ensure_ascii=False))
            await websocket.send_text(json.dumps({"type": "turn_done", "roundCount": round_count}, ensure_ascii=False))

            recent_history.append(f"[系统] {final_output[:200]}")

            if result.get("should_end") or round_count >= MAX_ROUNDS:
                reason = result.get("director_decision", {}).get("end_reason", "达到轮次上限")
                await websocket.send_text(json.dumps({"type": "auto_end", "reason": reason, "roundCount": round_count}, ensure_ascii=False))
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception(f"WebSocket异常: {exc}")
