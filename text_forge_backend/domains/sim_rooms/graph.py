"""角色模拟导演图 — 循环对话 + 角色子Agent记忆 + 压缩 + 结束判断"""
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Annotated, Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from sqlalchemy import select, update

from config.logging import get_logger
from core.model_factory import ModelFactory
from shared.utils import merge_dicts as _merge_dicts

logger = get_logger(__name__)

MAX_ROUNDS = 30
COMPRESS_EVERY = 5


class SimRoomState(TypedDict):
    room_id: int
    round_count: int
    should_end: bool
    last_user_input: str
    speak_as: str
    room_setting: str
    character_details: list[dict[str, Any]]
    character_memories: dict[str, str]  # character_label -> compressed memory
    model_config: dict[str, Any]        # 用户模型配置（来自前端，经 WS 传入）
    recent_history: list[str]           # last 5 round summaries
    director_decision: dict[str, Any] | None
    character_outputs: Annotated[dict[str, str], _merge_dicts]
    scene_output: str | None
    final_output: str


def _build_bridge(
    execute_sql, room_id: int, character_details: list[dict[str, Any]],
    model_config: dict[str, Any] | None = None, user_id: int = 0, book_id: int = 0,
) -> dict[str, Any]:
    """桥接方法：提供数据库访问给图节点。execute_sql 是 async 函数，接收 SQLAlchemy statement。

    Args:
        execute_sql: 异步数据库执行函数。
        room_id: 模拟房间 ID。
        character_details: 房间角色详情列表。
        model_config: 用户模型配置（来自前端 IndexedDB，经 WS 传入），用于初始化 LLM。
        user_id: 房间所属用户 ID。
        book_id: 房间所属书籍 ID。
    """
    return {
        "execute_sql": execute_sql,
        "room_id": room_id,
        "character_details": character_details,
        "model_config": model_config or {},
        "user_id": user_id,
        "book_id": book_id,
    }


def _get_factory(bridge: dict[str, Any]) -> ModelFactory:
    """按房间用户模型配置创建模型工厂，配置缺失时降级为空配置（调用方需捕获异常）。

    Returns:
        ModelFactory 实例。
    """
    return ModelFactory(bridge.get("model_config") or {})


def _build_scene_prompt(state: SimRoomState) -> str:
    """构造场景描写提示词，统一禁止服务用语与破次元表述。

    Args:
        state: 模拟对话状态。

    Returns:
        场景描写 prompt 字符串。
    """
    decision = state.get("director_decision") or {}
    focus = decision.get("scene_focus", "")
    tone = decision.get("tone", "")
    chars = state.get("character_outputs", {})
    chars_summary = "\n".join(f"{k}：{v[:200]}" for k, v in chars.items())
    recent = "\n".join(state["recent_history"][-3:])
    return f"""你是场景描写助手。环境设定：{state['room_setting']}

当前氛围：{tone}
焦点：{focus}
角色最近发言：{chars_summary or '无'}
最近场景：{recent}

请生成一段简短的场景描写（50-150字），包含环境细节、光影、氛围，自然衔接角色互动。只输出描写内容。
严禁出现任何服务用语、AI 身份表述或跳出作品世界观的说明（如"作为AI""有什么可以帮助您""以上是我为你生成的"等），保持完全沉浸的小说叙事。"""


def _build_character_messages(state: SimRoomState, speaker_label: str, char: dict[str, Any]) -> list:
    """构造单个角色的系统+用户消息，统一禁止服务用语与破次元表述。

    Args:
        state: 模拟对话状态。
        speaker_label: 角色名（role_label）。
        char: 角色详情字典。

    Returns:
        [SystemMessage, HumanMessage] 消息列表。
    """
    char_desc = char.get("description", "") or char.get("personality_override", "") or ""
    memory = state["character_memories"].get(speaker_label, "")
    recent = "\n".join(state["recent_history"][-5:])
    user_input = state["last_user_input"]
    tone = (state.get("director_decision") or {}).get("tone", "")

    sys = SystemMessage(content=f"""你是角色【{speaker_label}】。严格按你的性格和口吻回复。

角色设定：{char_desc[:500]}
当前氛围：{tone}
角色记忆：{memory or '暂无'}
最近对话：{recent}

用户发言（{state['speak_as']}）：{user_input}

以角色【{speaker_label}】的口吻回复，可包含对话、动作、表情。只输出发言内容。
严禁出现任何服务用语、AI 身份表述或跳出作品世界观的说明（如"作为AI""很高兴为您服务""有什么可以帮您"等），完全以角色身份沉浸式回应，不要解释自己。""")

    human = HumanMessage(content=f"请以【{speaker_label}】的身份回应。")
    return [sys, human]


async def _astream_text(model, messages) -> AsyncGenerator[str, None]:
    """流式迭代模型输出文本片段。

    Args:
        model: BaseChatModel 实例。
        messages: 单条 prompt 字符串或消息列表。

    Yields:
        模型输出的文本片段（逐 chunk）。
    """
    async for chunk in model.astream(messages):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


async def director_decide_node(state: SimRoomState) -> dict[str, Any]:
    if state["round_count"] >= MAX_ROUNDS:
        return {"should_end": True, "director_decision": {"action": "end", "reason": "已达30轮上限"}}

    chars_desc = "\n".join(
        f"- {c['role_label']}（entity_id={c.get('entity_id')}, description={c.get('description', '')[:200]}）"
        for c in state["character_details"]
    )
    recent = "\n".join(state["recent_history"][-5:]) or "（对话刚开始）"
    user_input = state["last_user_input"]
    speak_as = state["speak_as"]

    prompt = f"""你是模拟对话的导演，负责决定下一步谁发言、是否需要场景描写，以及对话是否结束。

场景设定：{state['room_setting']}

角色列表：
{chars_desc}

最近对话：
{recent}

用户最新输入（{speak_as}）：{user_input}

请输出 JSON，包含以下字段：
- action: "speak" | "scene" | "end"
- speakers: 需要发言的角色名列表（action=speak 时）
- scene_focus: 场景描写的焦点关键词（action=scene 时）
- end_reason: 结束原因（action=end 时）
- tone: 当前氛围（如 紧张/轻松/悲伤/悬疑）

只输出 JSON，不要其他内容。严禁在决策外夹带任何服务用语或对用户的解释说明。"""

    llm = ModelFactory(state.get("model_config") or {})
    result = await llm.tool.ainvoke(prompt)
    text = result.content if hasattr(result, "content") else str(result)
    try:
        import json
        decision = json.loads(text.strip().removeprefix("```json").removesuffix("```").strip())
    except Exception:
        decision = {"action": "speak", "speakers": [c["role_label"] for c in state["character_details"]]}

    should_end = decision.get("action") == "end"
    return {"director_decision": decision, "should_end": should_end}


async def character_speak_node(state: SimRoomState) -> dict[str, Any]:
    decision = state.get("director_decision") or {}
    speakers = list(decision.get("speakers", []))
    if not speakers:
        return {}

    char_outputs: dict[str, str] = {}
    chars_map = {c["role_label"]: c for c in state["character_details"]}

    for speaker_label in speakers:
        char = chars_map.get(speaker_label)
        if not char:
            continue
        messages = _build_character_messages(state, speaker_label, char)
        llm = ModelFactory(state.get("model_config") or {})
        result = await llm.main.ainvoke(messages)
        content = result.content if hasattr(result, "content") else str(result)
        char_outputs[speaker_label] = content

    return {"character_outputs": char_outputs}


async def scene_describe_node(state: SimRoomState) -> dict[str, Any]:
    decision = state.get("director_decision") or {}
    if decision.get("action") != "scene":
        return {"scene_output": None}

    llm = ModelFactory(state.get("model_config") or {})
    prompt = _build_scene_prompt(state)
    result = await llm.main.ainvoke(prompt)
    content = result.content if hasattr(result, "content") else str(result)
    return {"scene_output": content}


async def stream_sim_round(
    state: SimRoomState,
    bridge: dict[str, Any],
    on_token,
) -> dict[str, Any]:
    """流式执行一轮模拟对话：场景/角色发言逐 token 回调，替代 graph.ainvoke 的整轮等待。

    流程与 graph 一致：director 决策 → （scene | character_speak）流式 → 记忆压缩 → 拼接输出。
    用户配置缺失等异常由调用方（WebSocket 循环）捕获并发送 error。

    Args:
        state: 当前轮状态。
        bridge: 桥接上下文（含 execute_sql/room_id/user_id/book_id/model_config）。
        on_token: 接收文本片段的 async 回调（通常向 WebSocket 推送 stream_token）。
            签名 on_token(piece: str, speaker: str)，speaker 为角色名或固定值 "场景"。

    Returns:
        更新后的完整 state。
    """
    decision_state = await director_decide_node(state)
    state.update(decision_state)
    if state.get("should_end"):
        state["final_output"] = ""
        return state

    decision = state.get("director_decision") or {}
    char_outputs: dict[str, str] = {}
    scene_output: str | None = None
    llm = ModelFactory(state.get("model_config") or {})

    if decision.get("action") == "scene":
        scene_output = ""
        async for piece in _astream_text(llm.main, _build_scene_prompt(state)):
            scene_output += piece
            await on_token(piece, "场景")
    else:
        chars_map = {c["role_label"]: c for c in state["character_details"]}
        for speaker_label in list(decision.get("speakers", [])):
            char = chars_map.get(speaker_label)
            if not char:
                continue
            messages = _build_character_messages(state, speaker_label, char)
            content = ""
            async for piece in _astream_text(llm.main, messages):
                content += piece
                await on_token(piece, speaker_label)
            char_outputs[speaker_label] = content

    state["character_outputs"] = char_outputs
    state["scene_output"] = scene_output
    stitched = await stitch_output_node(state)
    state["final_output"] = stitched["final_output"]

    # 记忆压缩（静默失败，不影响本轮输出）
    try:
        compressed = await compress_memories_node(state, bridge)
        state["character_memories"] = compressed.get("character_memories", state.get("character_memories", {}))
    except Exception as exc:
        logger.warning(f"压缩角色记忆失败: {exc}")

    return state


async def stitch_output_node(state: SimRoomState) -> dict[str, Any]:
    parts: list[str] = []
    chars = state.get("character_outputs", {})
    scene = state.get("scene_output")

    if scene:
        parts.append(scene.strip())
    for label, text in chars.items():
        parts.append(f"{label}：{text}")

    return {"final_output": "\n\n".join(parts)}


async def compress_memories_node(state: SimRoomState, bridge: dict[str, Any]) -> dict[str, Any]:
    if state["round_count"] % COMPRESS_EVERY != 0 or state["round_count"] == 0:
        return {"character_memories": state.get("character_memories", {})}

    execute_sql = bridge.get("execute_sql")
    room_id = bridge.get("room_id")
    user_id = bridge.get("user_id", 0)
    book_id = bridge.get("book_id") or 0
    new_memories = dict(state.get("character_memories", {}))

    for char in state["character_details"]:
        label = char["role_label"]
        char_id = char.get("entity_id")
        if not char_id:
            continue

        char_output = state.get("character_outputs", {}).get(label, "")
        old_memory = new_memories.get(label, "")
        recent = "\n".join(state["recent_history"][-COMPRESS_EVERY:])

        if not old_memory and not recent:
            continue

        llm = ModelFactory(bridge.get("model_config") or {})
        compress_prompt = f"""将以下角色对话记忆压缩为一段 200 字内的摘要。

角色：{label}
旧记忆：{old_memory[:300]}
最近对话：{recent[:500]}
本回合角色发言：{char_output[:300]}

只输出压缩后的摘要，不要其他内容。"""
        try:
            result = await llm.tool.ainvoke(compress_prompt)
            compressed = result.content if hasattr(result, "content") else str(result)
        except Exception:
            compressed = f"{old_memory} | {recent[:100]}" if old_memory else recent[:200]

        new_memories[label] = compressed[:300]

        if execute_sql:
            try:
                from models.agent_memory import AgentMemory
                source = f"sim_room:{room_id}:char:{char_id}"
                stmt = select(AgentMemory).where(
                    AgentMemory.source == source,
                    AgentMemory.user_id == user_id,
                )
                agent_mem_result = await execute_sql(stmt)
                existing = agent_mem_result.scalar_one_or_none()
                if existing:
                    await execute_sql(
                        update(AgentMemory)
                        .where(AgentMemory.id == existing.id)
                        .values(book_id=book_id or existing.book_id, content=compressed[:300], updated_at=datetime.now())
                    )
                else:
                    await execute_sql(
                        AgentMemory.__table__.insert().values(
                            user_id=user_id,
                            book_id=book_id or None,
                            memory_type="sim_character",
                            source=source,
                            content=compressed[:300],
                            priority=5,
                            is_compressed=True,
                        )
                    )
            except Exception as exc:
                logger.warning(f"保存角色记忆失败: {exc}")

    return {"character_memories": new_memories}


def director_router(state: SimRoomState) -> str:
    if state["should_end"]:
        return END
    decision = state.get("director_decision") or {}
    if decision.get("action") == "scene":
        return "scene_describe"
    return "character_speak"


def char_router(state: SimRoomState) -> str:
    decision = state.get("director_decision") or {}
    if decision.get("action") == "scene":
        return "scene_describe"
    return "compress_memories"


def scene_router(state: SimRoomState) -> str:
    return "compress_memories"


def _wrap_compress(bridge: dict[str, Any]):
    """用真正的 async 函数包装 compress_memories_node。

    LangGraph 会检查节点函数是否为协程函数；直接传同步 lambda 返回 coroutine
    会被当作同步函数调用，导致「Expected dict, got coroutine」错误。

    Args:
        bridge: 桥接上下文。

    Returns:
        绑定 bridge 的 async 节点函数。
    """
    async def _node(state: SimRoomState) -> dict[str, Any]:
        return await compress_memories_node(state, bridge)

    return _node


def build_sim_director_graph(bridge: dict[str, Any]):
    builder = StateGraph(SimRoomState)
    builder.add_node("director_decide", director_decide_node)
    builder.add_node("character_speak", character_speak_node)
    builder.add_node("scene_describe", scene_describe_node)
    builder.add_node("compress_memories", _wrap_compress(bridge))
    builder.add_node("stitch_output", stitch_output_node)

    builder.set_entry_point("director_decide")
    builder.add_conditional_edges("director_decide", director_router)
    builder.add_conditional_edges("character_speak", char_router)
    builder.add_edge("scene_describe", "compress_memories")
    builder.add_edge("compress_memories", "stitch_output")
    builder.add_edge("stitch_output", END)

    return builder.compile()
