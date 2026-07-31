from typing import Optional, Dict, Any, Callable
from domains.agent.agent_state import UserAgentState
from core.model_factory import ModelFactory
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, START, END
from config.logging import get_logger

logger = get_logger(__name__)


class GenerateChapterState(UserAgentState):
    book_id: int
    chapter_id: int
    instruction: str
    context: str
    plan: str
    content: str
    reflection: str
    progress_callback: Optional[Callable[[Dict[str, Any]], None]]


async def _emit_progress(
    state: GenerateChapterState,
    step: str,
    n: int,
    total: int,
    words: int = 0,
    eta: float = 0.0,
):
    callback = state.get("progress_callback")
    if callback:
        try:
            callback({"step": step, "n": n, "total": total, "words": words, "eta": eta})
        except Exception as exc:
            logger.warning(f"progress_callback 失败: {exc}")


async def think_node(state: GenerateChapterState) -> Dict[str, Any]:
    await _emit_progress(state, "think", 1, 4)
    llm = ModelFactory(state["model_config"])
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(
                content="你是写作规划助手。分析用户指令和书籍上下文，为章节写作制定策略。"
            ),
            HumanMessage(
                content=f"""书籍上下文：
{state.get('context', '')}

章节ID：{state.get('chapter_id')}
用户指令：{state.get('instruction', '无')}

请分析写作要点，包括：重点场景、人物互动、情感基调、与前后文的关联。直接输出分析结果："""
            ),
        ]
    )
    try:
        result = await llm.main.ainvoke(prompt.format_messages())
        analysis = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.warning(f"think_node 失败: {exc}")
        analysis = f"分析失败: {exc}"
    return {
        "plan": analysis,
        "step_outputs": {**state.get("step_outputs", {}), "think": analysis},
    }


async def plan_node(state: GenerateChapterState) -> Dict[str, Any]:
    await _emit_progress(state, "plan", 2, 4, words=len(state.get("plan", "")))
    llm = ModelFactory(state["model_config"])
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(
                content="你是写作规划助手。根据分析结果，制定详细的章节写作大纲。"
            ),
            HumanMessage(content=f"""分析结果：
{state.get('plan', '')}

请制定章节写作大纲，包含3-5个关键段落，每段说明重点内容和字数分配。直接输出大纲："""),
        ]
    )
    try:
        result = await llm.main.ainvoke(prompt.format_messages())
        plan = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.warning(f"plan_node 失败: {exc}")
        plan = f"规划失败: {exc}"
    return {"plan": plan}


async def execute_node(state: GenerateChapterState) -> Dict[str, Any]:
    await _emit_progress(state, "execute", 3, 4, words=len(state.get("plan", "")))
    llm = ModelFactory(state["model_config"])
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(
                content="你是专业的小说写作助手。根据大纲和上下文，写出高质量的章节正文。"
            ),
            HumanMessage(content=f"""书籍上下文：
{state.get('context', '')}

写作大纲：
{state.get('plan', '')}

用户指令：{state.get('instruction', '无')}

请根据大纲写出完整章节正文，要求：
1. 保持与书籍设定一致
2. 文风自然流畅
3. 直接输出正文内容"""),
        ]
    )
    try:
        result = await llm.main.ainvoke(prompt.format_messages())
        content = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.error(f"execute_node 失败: {exc}", exc_info=True)
        content = ""
    return {"content": content}


async def reflect_node(state: GenerateChapterState) -> Dict[str, Any]:
    await _emit_progress(state, "reflect", 4, 4, words=len(state.get("content", "")))
    llm = ModelFactory(state["model_config"])
    content = state.get("content", "")
    if not content:
        return {"content": content, "reflection": "生成内容为空"}
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(content="你是审稿编辑。请审阅生成的章节正文，给出修改建议。"),
            HumanMessage(
                content=f"""请审阅以下章节正文，指出需要改进的地方（逻辑、文笔、一致性等）。

正文：
{content[:3000]}

请直接输出审阅意见："""
            ),
        ]
    )
    try:
        result = await llm.main.ainvoke(prompt.format_messages())
        reflection = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        logger.warning(f"reflect_node 失败: {exc}")
        reflection = f"审阅失败: {exc}"
    return {
        "reflection": reflection,
        "step_outputs": {**state.get("step_outputs", {}), "reflect": reflection},
    }


def _route_after_reflect(state: GenerateChapterState) -> str:
    reflection = state.get("reflection", "")
    if reflection and (
        "严重" in reflection or "不一致" in reflection or "逻辑错误" in reflection
    ):
        return "execute"
    return END


def build_generate_chapter_graph():
    builder = StateGraph(GenerateChapterState)
    builder.add_node("think", think_node)
    builder.add_node("plan", plan_node)
    builder.add_node("execute", execute_node)
    builder.add_node("reflect", reflect_node)
    builder.add_edge(START, "think")
    builder.add_edge("think", "plan")
    builder.add_edge("plan", "execute")
    builder.add_edge("execute", "reflect")
    builder.add_conditional_edges(
        "reflect", _route_after_reflect, {"execute": "execute", END: END}
    )
    return builder.compile()
