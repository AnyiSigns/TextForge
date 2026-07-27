import json

from agents.state import MainState
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage


async def main_node(state: MainState):
    llm = ModelFactory(state["model_config"])
    parts = [
        f"世界观设定：\n{state['input_worldview']}",
        f"角色设定：\n{state['input_characters']}",
        f"前情摘要：\n{state['input_brief_summary']}",
        f"最近章节正文：\n{state['input_recent_chapters']}",
        f"大纲结构：\n{state['input_outline']}",
    ]
    input_message = "\n\n".join(parts)
    messages = [
        SystemMessage(state["system_prompt"]),
        HumanMessage(f"项目上下文\n{input_message}\n\n当前任务输入：\n{json.dumps(state['input_context'], ensure_ascii=False, indent=2)}"),
    ]
    response = await llm.main.ainvoke(messages)
    return {"output": response.content}
