"""SimRoom WebSocket 上下文装载：角色详情/场景设定/历史消息/角色记忆/桥接上下文。"""
from config.logging import get_logger
from models.agent_memory import AgentMemory
from models.book import Character, Foreshadowing, Location, PlotThread, SceneEvent
from models.sim_room import SimMessage, SimParticipant, SimRoom
from shared.database import db_manager
from sqlalchemy import select

logger = get_logger(__name__)


async def load_room_context(room_id: int, room: SimRoom, model_config: dict) -> dict:
    """装载房间 WebSocket 上下文。

    一次性批量加载：地点/关联事件/伏笔/剧情线索 → 场景设定文本；
    参与者 + 批量角色描述 → 角色详情；用户扮演角色 → user_char_detail；
    历史消息 → recent_history；角色记忆 → character_memories；持久化轮数 → round_count。

    Args:
        room_id: 模拟房间 ID。
        room: SimRoom 实例。
        model_config: 用户模型配置（注入桥接上下文）。

    Returns:
        含 setting_text / char_details / user_char_detail / recent_history /
        character_memories / round_count / participants / my_role_label / bridge 的字典。
    """
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

    bridge = {"execute_sql": _execute_sql, "room_id": room_id, "character_details": char_details, "user_id": room.user_id, "book_id": room.book_id, "model_config": model_config}

    # 用户扮演的「我的身份」角色名（entity_type="user" 的参与者）
    my_role_label = "用户"
    for p in participants:
        if p.entity_type == "user" and p.entity_id and p.entity_id != room.user_id:
            my_role_label = p.role_label or "用户"
            break

    return {
        "setting_text": setting_text,
        "char_details": char_details,
        "user_char_detail": user_char_detail,
        "recent_history": recent_history,
        "character_memories": character_memories,
        "round_count": round_count,
        "participants": participants,
        "my_role_label": my_role_label,
        "bridge": bridge,
    }
