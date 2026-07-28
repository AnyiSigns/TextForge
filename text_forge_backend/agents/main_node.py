import json
from agents.state import MainState
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import StreamWriter


async def main_node(state: MainState, writer: StreamWriter) -> dict:
    llm = ModelFactory(state["model_config"])
    parts = [
        f"世界观设定：\n{state.get('input_worldview', '')}",
        f"角色设定：\n{state.get('input_characters', '')}",
        f"前情摘要：\n{state.get('input_brief_summary', '')}",
        f"最近章节正文：\n{state.get('input_recent_chapters', '')}",
        f"大纲结构：\n{state.get('input_outline', '')}",
    ]
    input_message = "\n\n".join(parts)
    messages = [
        SystemMessage(state["system_prompt"]),
        HumanMessage(
            f"项目上下文\n{input_message}\n\n当前任务输入：\n{json.dumps(state['input_context'], ensure_ascii=False, indent=2)}"
        ),
    ]

    full_content = ""
    async for chunk in llm.main.astream(messages):
        if chunk.content:
            content = chunk.content
            full_content += content
            writer(content)

    return {"output": full_content}
