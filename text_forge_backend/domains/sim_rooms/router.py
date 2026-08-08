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
from domains.sim_rooms.graph import stream_sim_round, MAX_ROUNDS
from models.agent_memory import AgentMemory
from models.book import Character, Foreshadowing, Location, PlotThread, SceneEvent
from models.sim_room import SimBranch, SimMessage, SimParticipant, SimRoom
from shared.database import db_manager
from shared.pagination import PageParams, PageResult

router = APIRouter(prefix="/sim-rooms", tags=["角色模拟"])

BRANCH_TYPE_LABELS: dict[str, str] = {
    "backstory": "角色背景故事",
    "relationship": "角色关系线",
    "plot-thread": "剧情线索",
    "foreshadow-fill": "伏笔揭示",
    "voice-test": "角色语音测试",
}


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


async def _stream_llm_pieces(llm, prompt: str):
    """流式迭代模型输出的文本片段。

    Args:
        llm: BaseChatModel 实例。
        prompt: 提示词字符串。

    Yields:
        模型输出的文本片段（逐 chunk）。
    """
    async for chunk in llm.main.astream(prompt):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


async def _execute_round(
    websocket: WebSocket,
    room_id: int,
    round_count: int,
    user_content: str,
    speak_as: str,
    recent_history: list[str],
    character_memories: dict[str, str],
    char_details: list[dict],
    setting_text: str,
    parsed_model_config: dict,
    bridge: dict,
) -> tuple[int, bool, str]:
    """执行一轮模拟对话并流式输出。

    供 chat（用户发言）与 auto_advance（AI 自动推进）共用。

    Args:
        websocket: 客户端 WebSocket。
        room_id: 模拟房间 ID。
        round_count: 当前轮数。
        user_content: 本轮用户输入（自动推进时为导演推进指令）。
        speak_as: 发言身份（director 或 character:<id>）。
        recent_history: 最近对话摘要列表（执行后追加本轮输出）。
        character_memories: 角色记忆字典（执行后合并新增记忆）。
        char_details: 房间角色详情列表。
        setting_text: 场景设定文本。
        parsed_model_config: 用户模型配置。
        bridge: 图桥接上下文。

    Returns:
        (更新后的 round_count, 是否应结束, 结束原因)。
    """
    if round_count >= MAX_ROUNDS:
        # 已达轮次上限：不再发 stream_start，直接结束，避免无 token 的虚假流开始
        await websocket.send_text(json.dumps(
            {"type": "auto_end", "reason": "达到轮次上限", "roundCount": round_count}, ensure_ascii=False
        ))
        return round_count, True, "达到轮次上限"

    state = {
        "room_id": room_id,
        "round_count": round_count,
        "should_end": False,
        "last_user_input": user_content,
        "speak_as": speak_as,
        "room_setting": setting_text,
        "character_details": char_details,
        "character_memories": character_memories,
        "model_config": parsed_model_config,
        "recent_history": recent_history[-10:],
        "director_decision": None,
        "character_outputs": {},
        "scene_output": None,
        "final_output": "",
    }

    try:
        await websocket.send_text(json.dumps({"type": "stream_start"}, ensure_ascii=False))

        async def _on_token(piece: str, speaker: str) -> None:
            await websocket.send_text(json.dumps(
                {"type": "stream_token", "token": piece, "senderLabel": speaker}, ensure_ascii=False
            ))

        result = await stream_sim_round(state, bridge, _on_token)
    except Exception as exc:
        logger.exception(f"生成失败: {exc}")
        await websocket.send_text(json.dumps({"type": "error", "message": f"生成失败：{exc}"}, ensure_ascii=False))
        return round_count, False, ""

    round_count += 1

    # 更新记忆
    character_memories.update(result.get("character_memories", {}))

    final_output = result.get("final_output", "") or ""
    if not final_output:
        final_output = "\n".join(f"{k}：{v}" for k, v in result.get("character_outputs", {}).items())

    # 落库本轮输出：场景与各角色分别落库（前端按角色头像/名字渲染），并同步轮数
    async with db_manager.session_factory() as ss:
        scene_out = result.get("scene_output")
        if scene_out:
            ss.add(SimMessage(room_id=room_id, sender_type="system", sender_label="场景", content=scene_out.strip(), message_type="scene"))
        for label, text in (result.get("character_outputs") or {}).items():
            if text.strip():
                ss.add(SimMessage(room_id=room_id, sender_type="system", sender_label=label, content=text.strip(), message_type="dialogue"))
        # 轮数写回房间，刷新 updated_at，保证刷新/重连后轮数与列表排序不丢失
        r = await ss.get(SimRoom, room_id)
        if r:
            r.round_count = round_count
        await ss.commit()

    await websocket.send_text(json.dumps({"type": "turn_done", "roundCount": round_count}, ensure_ascii=False))

    recent_history.append(f"[系统][summary] {final_output[:200]}")

    should_end = bool(result.get("should_end")) or round_count >= MAX_ROUNDS
    end_reason = result.get("director_decision", {}).get("end_reason", "达到轮次上限") if should_end else ""
    if should_end:
        await websocket.send_text(json.dumps({"type": "auto_end", "reason": end_reason, "roundCount": round_count}, ensure_ascii=False))

    return round_count, should_end, end_reason


async def _generate_suggestions(
    recent_history: list[str],
    char_details: list[dict],
    setting_text: str,
    speak_as: str,
    model_config: dict | None = None,
) -> list[dict]:
    """根据当前对话上下文生成 2 条下一步行动建议，供前端卡片点选。

    Args:
        recent_history: 最近几轮对话的摘要文本列表。
        char_details: 房间参与者（角色）详情列表。
        setting_text: 场景设定文本（由地点等生成）。
        speak_as: 当前发言身份（director 或 character:<id>）。

    Returns:
        建议列表，每项形如 {"label": 简短标题, "content": 点击后发送的发言内容}。
    """
    recent = "\n".join(recent_history[-6:]) or "（对话刚开始）"
    chars = ", ".join(c["role_label"] for c in char_details) or "（无角色）"
    prompt = f"""你是小说模拟的导演助手。请根据以下对话上下文，给用户推荐 2 个"下一步该做什么"的行动选项。

场景设定：{setting_text}
房间角色：{chars}
当前身份：{speak_as}
最近对话：
{recent}

输出 JSON，格式如下（只输出 JSON，不要其他内容）：
{{"items": [
  {{"label": "选项简短标题（10字内）", "content": "点击后发送给模拟的完整指令或发言"}},
  {{"label": "选项简短标题（10字内）", "content": "点击后发送给模拟的完整指令或发言"}}
]}}

选项内容要贴合剧情推进，以作品内的指令或发言形式呈现，严禁出现服务用语或对用户的提示性说明（如"作为AI""以上建议仅供参考"等）。"""
    try:
        llm = ModelFactory(model_config or {})
        result = await llm.tool.ainvoke(prompt)
        text = result.content if hasattr(result, "content") else str(result)
        import json as _json
        items = _json.loads(text.strip().removeprefix("```json").removesuffix("```").strip()).get("items", [])
        return [{"label": str(i.get("label", "继续剧情"))[:10], "content": str(i.get("content", ""))[:120]} for i in items if i.get("content")][:2]
    except Exception as exc:
        logger.warning(f"生成推荐建议失败: {exc}")
        return []


async def _generate_branch(
    room_id: int,
    branch_type: str,
    recent_history: list[str],
    char_details: list[dict],
    setting_text: str,
    related_event_ids: list[int],
    related_foreshadowing_ids: list[int],
    related_plot_thread_ids: list[int],
    location_id: int | None,
    model_config: dict | None = None,
    character_memories: dict[str, str] | None = None,
    user_char: dict | None = None,
) -> dict:
    """根据当前模拟对话生成一条结构化支线并落库。

    Args:
        room_id: 所属模拟房间 ID。
        branch_type: 支线类型（backstory/relationship/plot-thread/foreshadow-fill/voice-test）。
        recent_history: 最近对话摘要列表。
        char_details: 房间角色详情列表。
        setting_text: 场景设定文本。
        related_event_ids: 房间关联的时间线事件 ID 列表。
        related_foreshadowing_ids: 房间关联的伏笔 ID 列表。
        related_plot_thread_ids: 房间关联的剧情线索 ID 列表。
        location_id: 房间关联地点 ID。
        model_config: 用户模型配置。
        character_memories: 角色记忆字典（role_label -> 摘要），用于补充角色背景。
        user_char: 用户扮演的角色详情（entity_id/role_label/description），参与支线上下文与相关角色。

    Returns:
        生成的支线字典，包含 id/title/content/branchType/related 字段。
    """
    type_label = BRANCH_TYPE_LABELS.get(branch_type, "剧情支线")
    recent = "\n".join(recent_history[-10:]) or "（对话刚开始）"
    all_chars = list(char_details)
    if user_char and user_char.get("entity_id"):
        all_chars.append(user_char)
    chars = "\n".join(f"- {c['role_label']}（{c.get('description', '')[:200]}）" for c in all_chars) or "（无角色）"
    mem_lines = "\n".join(f"- {k}：{v[:150]}" for k, v in (character_memories or {}).items()) or "（暂无角色记忆）"
    prompt = f"""你是小说创作助手。请从下面这段角色模拟对话中，提炼出一条"角色支线"素材并落库。

支线类型：{type_label}（{branch_type}）
场景设定：{setting_text}
房间角色：
{chars}
角色记忆：
{mem_lines}
关联事件ID：{related_event_ids or '无'}
关联伏笔ID：{related_foreshadowing_ids or '无'}
关联剧情线索ID：{related_plot_thread_ids or '无'}

最近对话：
{recent}

请根据支线类型输出 JSON（只输出 JSON，不要其他内容）：
- title: 支线标题（20字内，概括这条支线）
- content: 支线内容（150-300字，作为可直接复用的创作素材，保留对话中的关键设定、冲突、情感与台词）

严禁在 JSON 中夹带任何服务用语或对用户的说明。"""
    try:
        llm = ModelFactory(model_config or {})
        result = await llm.tool.ainvoke(prompt)
        text = result.content if hasattr(result, "content") else str(result)
        import json as _json
        parsed = _json.loads(text.strip().removeprefix("```json").removesuffix("```").strip())
        title = str(parsed.get("title", "")).strip()[:100] or f"{type_label}-{len(recent_history)}轮"
        content = str(parsed.get("content", "")).strip() or (recent[:300] or "（对话暂无内容）")
    except Exception as exc:
        logger.warning(f"生成支线失败，回退为对话摘录: {exc}")
        title = f"{type_label}-{len(recent_history)}轮"
        content = recent[:300] or "（对话暂无内容）"

    char_ids = [c.get("entity_id") for c in all_chars if c.get("entity_id")]
    async with db_manager.session_factory() as ss:
        branch = SimBranch(
            room_id=room_id,
            title=title,
            content=content,
            branch_type=branch_type,
            related_character_ids=char_ids,
            related_location_id=location_id,
            related_event_id=related_event_ids[0] if related_event_ids else None,
            related_event_ids=related_event_ids,
            related_foreshadowing_id=related_foreshadowing_ids[0] if related_foreshadowing_ids else None,
            related_foreshadowing_ids=related_foreshadowing_ids,
            related_plot_thread_ids=related_plot_thread_ids,
        )
        ss.add(branch)
        await ss.commit()
        await ss.refresh(branch)

    return branch.to_dict()


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

        token = None
        # 认证凭证优先从 Sec-WebSocket-Protocol（subprotocol）读取：浏览器 WebSocket
        # 无法自定义请求头，token 放 query 会进入访问日志/代理日志（敏感泄露）；
        # JWT 为 base64url 字符集，合法作为 subprotocol 值。
        sec_protocol = websocket.headers.get("sec-websocket-protocol", "")
        if sec_protocol:
            token = sec_protocol.split(",")[0].strip()
        if not token:
            auth_header = websocket.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[len("Bearer "):]

        if not token:
            await websocket.close(code=4003, reason="缺少认证")
            return

        payload = verify_token(token)
        if not payload:
            await websocket.close(code=4003)
            return
        token_user_id = int(payload.get("sub", 0))
        if token_user_id != room.user_id:
            await websocket.close(code=4003)
            return

    await websocket.accept()

    # 构造角色详情 + 场景设定（由关联地点/时间线事件/伏笔/剧情线索生成）
    char_details: list[dict] = []
    setting_text = "自由场景"

    async with db_manager.session_factory() as s:
        if room.location_id:
            loc = await s.get(Location, room.location_id)
            if loc:
                setting_text = f"{loc.name} · {loc.description or ''}"

        # 关联上下文标题：时间线事件 / 伏笔 / 剧情线索
        if room.related_event_ids:
            ev_result = await s.execute(select(SceneEvent).where(SceneEvent.id.in_(room.related_event_ids)))
            ev_titles = [ev.title for ev in ev_result.scalars().all()]
            if ev_titles:
                setting_text += f" | 关联事件：{'、'.join(ev_titles)}"
        if room.related_foreshadowing_ids:
            fs_result = await s.execute(select(Foreshadowing).where(Foreshadowing.id.in_(room.related_foreshadowing_ids)))
            fs_titles = [fs.description[:50] for fs in fs_result.scalars().all()]
            if fs_titles:
                setting_text += f" | 关联伏笔：{'、'.join(fs_titles)}"
        if room.related_plot_thread_ids:
            pt_result = await s.execute(select(PlotThread).where(PlotThread.id.in_(room.related_plot_thread_ids)))
            pt_titles = [pt.name for pt in pt_result.scalars().all()]
            if pt_titles:
                setting_text += f" | 关联剧情线索：{'、'.join(pt_titles)}"

        participants = (await s.execute(
            select(SimParticipant).where(SimParticipant.room_id == room_id)
        )).scalars().all()

        # 批量加载参与者引用的角色描述，避免逐个 get(Character) 造成 N+1 查询
        char_ids_needed = [p.entity_id for p in participants if p.entity_type == "character" and p.entity_id]
        chars_map: dict[int, Character] = {}
        if char_ids_needed:
            char_rows = (await s.execute(
                select(Character).where(Character.id.in_(char_ids_needed))
            )).scalars().all()
            chars_map = {c.id: c for c in char_rows}

        for p in participants:
            if p.entity_type == "user":
                continue
            detail = {"role_label": p.role_label, "entity_type": p.entity_type, "entity_id": p.entity_id, "personality_override": p.personality_override, "description": ""}
            if p.entity_type == "character" and p.entity_id and p.entity_id in chars_map:
                detail["description"] = chars_map[p.entity_id].description or ""
            char_details.append(detail)

        # 用户扮演的「我的身份」角色详情：参与支线上下文/相关角色，但不作为 AI 发言者
        user_char_detail: dict | None = None
        for p in participants:
            if p.entity_type == "user" and p.entity_id and p.entity_id != room.user_id:
                uchar = await s.get(Character, p.entity_id)
                if uchar:
                    user_char_detail = {
                        "entity_id": p.entity_id,
                        "role_label": p.role_label or uchar.name,
                        "description": uchar.description or "",
                    }
                break

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

    # 从已持久化的轮数继续，避免重连后新轮覆盖丢失已有轮数
    round_count = room.round_count or 0

    async def _execute_sql(stmt):
        async with db_manager.session_factory() as ss:
            result = await ss.execute(stmt)
            return result

    bridge = {"execute_sql": _execute_sql, "room_id": room_id, "character_details": char_details, "user_id": room.user_id, "book_id": room.book_id, "model_config": parsed_model_config}

    # 用户扮演的「我的身份」角色名（entity_type="user" 的参与者）
    my_role_label = "用户"
    for p in participants:
        if p.entity_type == "user" and p.entity_id and p.entity_id != room.user_id:
            my_role_label = p.role_label or "用户"
            break

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
