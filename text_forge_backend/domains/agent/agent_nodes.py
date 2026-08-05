import json
from typing import Any

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END

from config.logging import get_logger
from core.model_factory import ModelFactory
from shared.utils import truncate_text

from .agent_state import UserAgentState
from .context_manager import _should_compress

logger = get_logger(__name__)

AGENT_SYSTEM_PROMPT = """你是 TextForge Agent，一位专业的 AI 小说创作助手。

## 创作流程

书籍创作分为五个阶段，你需要主动引导用户推进：

### 1. initializing（初始化）
- 目标：了解书籍基本设定，建立创作基础。
- 使用 get_book_context 查看当前书籍信息；用 lookup_outline 查看是否已有大纲。
- 若没有任何大纲结构（无卷无章），用 create_outline(mode="volume", title="第一卷", summary="...") 创建首卷，再用 create_outline(mode="chapter", volume_id=<卷ID>, title="第一章 ...", summary="...") 创建首章。
- 若角色/地点/世界观设定为空，建议进入 worldbuilding 阶段。

### 2. worldbuilding（世界观构建）
- 目标：创建角色、地点、时间线和世界观设定。
- 提供大段文本时，用 create_entities(source_text=文本) 一步完成【抽取+落库】（人物/地点/事件），不必再单独抽取。
- 也可结构化创建：create_entities(characters=[...], locations=[...], scene_events=[...], foreshadows=[...], plot_threads=[...])。
- 每创建一批后用 lookup_characters / lookup_locations / lookup_timeline 确认结果。
- 时间线事件如需更新，用 update_entity(kind="timeline", item_id=..., data={...})。
- 当角色、地点等基础设定基本完备后，建议进入 outlining 阶段。

### 3. outlining（大纲规划）
- 目标：规划卷和章节结构，确定故事主线和支线。
- 用 lookup_outline 查看当前大纲（按卷→章）；用 create_outline 新建卷或章节（可注入 summary）。
- 用 lookup_plot_threads 管理剧情线索，update_entity(kind="plot_thread", ...) 更新进展。
- 用 lookup_foreshadowing 规划伏笔，update_entity(kind="foreshadowing", ...) 回收伏笔。
- 用 update_entity(kind="chapter", item_id=..., data={summary: "..."}) 为章节补摘要。
- 用 generate_outline_extension 追加新章大纲（大纲不足时）。
- 大纲结构清晰后，建议进入 drafting 阶段。

### 4. drafting（撰写中）
- 目标：逐章生成正文内容。
- 核心工具：generate_chapter 生成章节内容；execute_workflow_node 执行工作流单个节点；execute_workflow 批量执行完整工作流。
- 生成前用 get_proactive_suggestions 检查遗漏（缺摘要、未回收伏笔等）。
- 生成后用 review_text(mode="consistency") 检查与设定一致性，review_text(mode="grammar") 检查语法。
- 需要修改时：read_chapter_content 读取正文 → transform_text(mode="polish"/"rewrite"/"expand"/"summarize"/"alternatives") 加工 → write_chapter_content 写回（一律新增版本，不覆盖）。
- 检索资料：search(mode="docs") 语义检索公开文档库，search(mode="web") 联网搜索。
- 所有章节生成完毕后，建议进入 revising 阶段。

### 5. revising（修订中）
- 目标：全面审查、润色和优化。
- 用 review_text(mode="consistency") 逐章检查一致性；transform_text 润色/扩写/改写；analyze_feedback_patterns 分析用户反馈。
- 可用 manage_memory(mode="save", ...) 沉淀创作偏好/设定要点，manage_memory(mode="recall", query=...) 在需要时取回记忆。
- 修改完成后告知用户修订完毕。

## 工具速查（共 22 个，调用前先理解参数）
- 查询：lookup_characters / lookup_outline / lookup_locations / lookup_timeline / lookup_foreshadowing / lookup_plot_threads
- 上下文：get_book_context
- 大纲结构：create_outline（mode=volume|chapter，可带 summary）
- 实体创建：create_entities（characters/locations/scene_events/foreshadows/plot_threads，支持 source_text 抽取）
- 实体更新：update_entity（kind: foreshadowing/plot_thread/timeline/chapter/character/location）
- 正文读写：read_chapter_content / write_chapter_content
- 文本加工：transform_text（mode: polish/rewrite/expand/summarize/alternatives）
- 检查：review_text（mode: grammar/consistency）
- 检索：search（mode: docs/web）
- 记忆：manage_memory（mode: save/recall/list/forget/update）
- 生成/工作流（保名）：generate_chapter / generate_outline_extension / execute_workflow / execute_workflow_node
- 反馈：analyze_feedback_patterns / get_proactive_suggestions

## 行为准则

- 对普通问候和闲聊自然地用简短友好的文字回应，介绍你的能力和当前创作阶段。
- 不要向用户提及 user_id 或 book_id，系统会自动处理身份验证。
- 工具调用完成后，用自然语言向用户报告结果，不要直接输出原始字段名或 JSON。
- 每完成一个操作后，主动判断当前是否应切换阶段，并在回复中提出建议。
- 调用 generate_chapter 时，先用 lookup_outline 确认章节存在。
- 严禁向用户提及工具名及任何内部参数"""


async def agent_call(state: UserAgentState) -> dict[str, Any]:
    llm = ModelFactory(state["model_config"])
    system_prompt = AGENT_SYSTEM_PROMPT

    user_id = state.get("user_id")
    book_id = state.get("active_book_id", 0) or 0
    if user_id is not None:
        system_prompt += f"\n\n[会话] user_id={user_id}  book_id={book_id}（内部标识，不要在回复中展示给用户）"

    compressed = state.get("compressed_context")
    if compressed:
        system_prompt += (
            f"\n\n历史对话压缩摘要：{truncate_text(compressed)}"
            f"（仅供你内部参考，严禁原样转述或展示给用户）"
        )

    if state.get("previous_chapter_summary"):
        system_prompt += f"\n\n上一章摘要：{state['previous_chapter_summary']}"
    if state.get("previous_chapter_content"):
        system_prompt += f"\n\n上一章正文（已截断）：{truncate_text(state['previous_chapter_content'])}"
    cross_ctx = state.get("cross_chapter_context", {})
    if cross_ctx:
        system_prompt += (
            f"\n\n跨章节上下文：{json.dumps(cross_ctx, ensure_ascii=False)}"
        )

    from shared.database import db_manager

    from .tools_domain import build_tools

    tools = build_tools(db_manager.session_factory, model_config=state["model_config"])
    tool_names = [t.name for t in tools]
    logger.debug(
        f"[agent_call] user_id={state.get('user_id')}  book_id={state.get('active_book_id')}  tools={len(tool_names)}  names={tool_names[:5]}{'...' if len(tool_names) > 5 else ''}"
    )
    bound_llm = llm.main.bind_tools(tools) if tools else llm.main

    full_content = ""
    full_reasoning = ""
    # 累积 AIMessageChunk，由 langchain 原生合并并解析 tool_calls，
    # 避免手动拼接 args 字符串在流式分片时被截断成空字典
    # （导致必填参数缺失、触发 "mode/title: Field required" 并陷入工具死循环）。
    accumulated = None

    async for chunk in bound_llm.astream(
        [SystemMessage(system_prompt)] + state["messages"]
    ):
        accumulated = chunk if accumulated is None else accumulated + chunk
        full_content += chunk.content or ""
        reasoning = getattr(chunk, "reasoning_content", None) or (
            chunk.additional_kwargs or {}
        ).get("reasoning_content", "")
        if reasoning:
            full_reasoning += reasoning

    additional_kwargs: dict = {}
    if full_reasoning:
        additional_kwargs["reasoning_content"] = full_reasoning

    # 优先使用 langchain 原生解析出的 tool_calls（args 已是正确的 dict，不再手动 json.loads）
    tool_calls: list[dict] = []
    raw_tool_calls = getattr(accumulated, "tool_calls", None) or []
    for tc in raw_tool_calls:
        name = tc.get("name")
        args = tc.get("args")
        if isinstance(args, str):
            try:
                args = json.loads(args) if args.strip() else {}
            except (json.JSONDecodeError, TypeError):
                args = {}
        if name and isinstance(args, dict):
            tool_calls.append({"name": name, "args": args, "id": tc.get("id") or ""})

    result = AIMessage(content=full_content, additional_kwargs=additional_kwargs)
    if tool_calls:
        result.tool_calls = tool_calls
        logger.debug(
            f"[agent_call] 解析到 {len(tool_calls)} 个工具调用: {json.dumps(tool_calls, ensure_ascii=False)[:500]}"
        )

    return {"messages": [result]}


def agent_router(state: UserAgentState) -> str:
    """Agent 路由函数。

    Args:
        state: Agent 状态。

    Returns:
        下一节点名称或 END。
    """
    pending_review = state.get("pending_review")
    if pending_review:
        return END

    messages = state.get("messages", [])
    if not messages:
        return END

    last = messages[-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tool_calls"
    return END


def quality_gate_router(state: UserAgentState) -> str:
    """工具执行后路由：检查是否需要质量审核、是否陷入工具失败死循环，或是否需要上下文压缩。

    Args:
        state: Agent 状态。

    Returns:
        END（触发审核中断）、compress（需要压缩上下文）或 agent（继续对话）。
    """
    pending_review = state.get("pending_review")
    if pending_review:
        return END

    # 工具连续失败保护：空参数/报错会导致模型无限重试并不断触发上下文压缩，
    # 连续 3 次工具失败直接终止本次图执行，避免死循环与无意义压缩。
    messages = state.get("messages", [])
    fail_streak = 0
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            if _is_tool_error(msg):
                fail_streak += 1
            else:
                break
        else:
            break
    if fail_streak >= 3:
        logger.warning(f"[quality_gate_router] 检测到连续 3 次工具失败，终止循环以防止无限压缩")
        return END

    if _should_compress(state):
        return "compress"
    return "agent"


def _is_tool_error(msg: ToolMessage) -> bool:
    """判断 ToolMessage 是否代表工具执行失败。

    Args:
        msg: 工具返回的 ToolMessage。

    Returns:
        是否失败。
    """
    content = msg.content
    if isinstance(content, dict):
        return bool(content.get("error"))
    if isinstance(content, str):
        low = content.lower()
        return "error" in low or "field required" in low or "could not find tool" in low
    return False


async def quality_gate_node(state: UserAgentState) -> dict[str, Any]:
    """工具执行后质量门：检查 execute_workflow_node 输出是否需要用户审核。"""
    messages = state.get("messages", [])

    last_tool_call = None
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            last_tool_call = msg
            break

    if not last_tool_call:
        return {}

    tool_name = getattr(last_tool_call, "name", "")
    if tool_name not in ("execute_workflow_node", "execute_workflow"):
        return {}

    tool_content = getattr(last_tool_call, "content", "")
    if not tool_content:
        return {}

    try:
        result = json.loads(tool_content)
    except json.JSONDecodeError:
        return {}

    if not isinstance(result, dict):
        return {}

    if result.get("needs_review"):
        quality_check = result.get("quality_check", {})
        pending_review = {
            "node_id": result.get("node_id", ""),
            "node_label": result.get("node_label", ""),
            "output_preview": result.get("output", "")[:1000],
            "reason": quality_check.get("reason", "输出质量不满足角色节点要求"),
            "system_prompt": quality_check.get("system_prompt", ""),
        }
        return {"pending_review": pending_review}

    if result.get("status") == "completed":
        node_id = result.get("node_id", "")
        if node_id:
            node_output = {
                "output": result.get("output", ""),
                "label": result.get("node_label", ""),
                "tokens": result.get("tokens", 0),
            }
            return {"workflow_node_outputs": {node_id: node_output}}

    if result.get("status") == "pending_review":
        pending_node_id = result.get("pending_node_id", "")
        pending_node_label = result.get("pending_node_label", "")
        qc = (result.get("node_results", [{}])[-1]).get("quality_check", {})
        pending_review = {
            "node_id": pending_node_id,
            "node_label": pending_node_label,
            "output_preview": "",
            "reason": qc.get("reason", "输出质量不满足角色节点要求"),
            "system_prompt": qc.get("system_prompt", ""),
        }
        return {"pending_review": pending_review}

    if result.get("status") == "completed" and result.get("node_results"):
        accumulated: dict = {}
        for r in result["node_results"]:
            if r.get("status") == "completed":
                accumulated[r["node_id"]] = {
                    "output": r.get("output", ""),
                    "label": r.get("node_label", ""),
                    "tokens": r.get("tokens", 0),
                }
        return {"workflow_node_outputs": accumulated}

    return {}
