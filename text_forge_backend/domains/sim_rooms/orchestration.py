"""SimRoom 回合编排：LLM 流式输出、单轮执行、建议生成、支线生成与落库。"""
import json

from config.logging import get_logger
from core.model_factory import ModelFactory
from fastapi import WebSocket
from models.sim_room import SimBranch, SimMessage, SimRoom
from shared.database import db_manager

from domains.sim_rooms.graph import MAX_ROUNDS, stream_sim_round

logger = get_logger(__name__)

BRANCH_TYPE_LABELS: dict[str, str] = {
    "backstory": "角色背景故事",
    "relationship": "角色关系线",
    "plot-thread": "剧情线索",
    "foreshadow-fill": "伏笔揭示",
    "voice-test": "角色语音测试",
}


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
