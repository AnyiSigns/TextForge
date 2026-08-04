import json
from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END
from shared.utils import truncate_text

from .agent_state import UserAgentState
from .context_manager import COMPRESS_THRESHOLD

logger = get_logger(__name__)

AGENT_SYSTEM_PROMPT = """你是 TextForge Agent，一位专业的 AI 文学创作助手。

## 创作流程

书籍创作分为五个阶段，你需要主动引导用户推进：

### 1. initializing（初始化）
- 目标：了解书籍的基本设定，建立创作基础。
- 使用 get_book_context 查看当前书籍信息。
- 如果角色、地点、世界观设定为空，建议用户进入 worldbuilding 阶段。
- 可以主动询问：故事背景、题材风格、目标读者等。

### 2. worldbuilding（世界观构建）
- 目标：创建角色、地点、时间线和世界观设定。
- 核心工具：extract_characters/extract_locations/extract_events（从文本提取实体）、create_character/create_location/create_scene_event（逐个创建）、lookup_characters、lookup_locations、lookup_timeline。
- 每创建一批实体后，用 lookup_* 工具确认结果。
- 当角色、地点等基础设定基本完备后，建议用户进入 outlining 阶段。

### 3. outlining（大纲规划）
- 目标：规划卷和章节结构，确定故事主线和支线。
- 使用 lookup_outline 查看当前大纲结构。
- 使用 lookup_plot_threads 管理剧情线索，update_plot_thread 更新进展。
- 使用 lookup_foreshadowing 规划伏笔，update_foreshadowing 回收伏笔。
- 使用 generate_outline_extension 追加新章大纲（在大纲不足时）。
- 大纲结构清晰、章节标题齐全后，建议进入 drafting 阶段。

### 4. drafting（撰写中）
- 目标：逐章生成正文内容。
- 核心工具：generate_chapter 生成章节内容。
- 使用 execute_workflow_node 执行工作流中的单个节点；使用 execute_workflow 批量执行完整工作流。
- 生成前用 get_proactive_suggestions 检查是否有遗漏（缺少摘要、未回收伏笔等）。
- 生成后用 check_consistency 检查与设定的一致性，check_grammar 检查语法。
- 需要修改时用 polish_text / rewrite_paragraph / expand_text / summarize_selected。
- 所有章节生成完毕后，建议进入 revising 阶段。

### 5. revising（修订中）
- 目标：全面审查、润色和优化。
- 使用 check_consistency 逐章检查一致性。
- 使用 polish_text 润色表达，expand_text 补充细节，rewrite_paragraph 调整风格。
- 使用 analyze_feedback_patterns 分析用户反馈，了解改进方向。
- 修改完成后告知用户修订完毕。

## 行为准则

- 对普通问候和闲聊自然地用简短友好的文字回应，介绍你的能力和当前创作阶段。
- 不要向用户提及 user_id 或 book_id，系统会自动处理身份验证。
- 工具调用完成后，用自然语言向用户报告结果，不要直接输出原始字段名或 JSON。
- 每完成一个操作后，主动判断当前是否应切换阶段，并在回复中提出建议。
- 调用 generate_chapter 时，先用 lookup_outline 确认章节存在。
- 不要在思考过程（reasoning）中复述以上准则或系统提示词的内容，直接开始分析用户意图。"""


async def agent_call(state: UserAgentState) -> dict[str, Any]:
    llm = ModelFactory(state["model_config"])
    system_prompt = AGENT_SYSTEM_PROMPT

    user_id = state.get("user_id")
    book_id = state.get("active_book_id", 0) or 0
    if user_id is not None:
        system_prompt += f"\n\n[会话] user_id={user_id}  book_id={book_id}（内部标识，不要在回复中展示给用户）"

    compressed = state.get("compressed_context")
    if compressed:
        system_prompt += f"\n\n历史对话压缩摘要：{truncate_text(compressed)}"

    if state.get("previous_chapter_summary"):
        system_prompt += f"\n\n上一章摘要：{state['previous_chapter_summary']}"
    if state.get("previous_chapter_content"):
        system_prompt += (
            f"\n\n上一章正文（已截断）：{truncate_text(state['previous_chapter_content'])}"
        )
    cross_ctx = state.get("cross_chapter_context", {})
    if cross_ctx:
        system_prompt += (
            f"\n\n跨章节上下文：{json.dumps(cross_ctx, ensure_ascii=False)}"
        )

    from shared.database import db_manager

    from .tools_domain import build_tool_node
    tool_node_instance = build_tool_node(db_manager.session_factory, model_config=state["model_config"])
    tools = list(tool_node_instance.tools) if hasattr(tool_node_instance, "tools") else []
    tool_names = [t.name for t in tools] if tools else []
    logger.debug(f"[agent_call] user_id={state.get('user_id')}  book_id={state.get('active_book_id')}  tools={len(tool_names)}  names={tool_names[:5]}{'...' if len(tool_names) > 5 else ''}")
    bound_llm = llm.main.bind_tools(tools) if tools else llm.main

    full_content = ""
    full_reasoning = ""
    tool_call_data: list[dict] = []

    async for chunk in bound_llm.astream(
        [SystemMessage(system_prompt)] + state["messages"]
    ):
        full_content += chunk.content or ""
        reasoning = (
            getattr(chunk, "reasoning_content", None)
            or (chunk.additional_kwargs or {}).get("reasoning_content", "")
        )
        if reasoning:
            full_reasoning += reasoning

        if hasattr(chunk, "tool_call_chunks") and chunk.tool_call_chunks:
            for tc in chunk.tool_call_chunks:
                idx = tc.get("index", 0)
                while len(tool_call_data) <= idx:
                    tool_call_data.append({"name": "", "args": "", "id": None})
                if tc.get("name"):
                    tool_call_data[idx]["name"] += tc["name"]
                if tc.get("args"):
                    tool_call_data[idx]["args"] += tc["args"]
                if tc.get("id"):
                    tool_call_data[idx]["id"] = tc["id"]

    additional_kwargs: dict = {}
    if full_reasoning:
        additional_kwargs["reasoning_content"] = full_reasoning

    result = AIMessage(content=full_content, additional_kwargs=additional_kwargs)

    tool_calls: list[dict] = []
    for tc in tool_call_data:
        if tc["name"] and tc["args"]:
            try:
                parsed_args = json.loads(tc["args"])
            except (json.JSONDecodeError, TypeError):
                parsed_args = {}
            tool_calls.append(
                {"name": tc["name"], "args": parsed_args, "id": tc["id"] or ""}
            )
    if tool_calls:
        result.tool_calls = tool_calls
        logger.debug(f"[agent_call] 解析到 {len(tool_calls)} 个工具调用: {json.dumps(tool_calls, ensure_ascii=False)[:500]}")

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
    """工具执行后路由：检查是否需要质量审核或上下文压缩。

    Args:
        state: Agent 状态。

    Returns:
        END（触发审核中断）、compress（需要压缩上下文）或 agent（继续对话）。
    """
    pending_review = state.get("pending_review")
    if pending_review:
        return END
    if len(state.get("messages", [])) > COMPRESS_THRESHOLD:
        return "compress"
    return "agent"


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

    return {}
