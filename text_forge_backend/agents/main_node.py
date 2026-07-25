import json

from agents.state import MainState
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage


async def main_node(state: MainState):
    llm = ModelFactory(state["model_config"])
    input_message = json.dumps(state["input_context"], ensure_ascii=False, indent=2)
    messages = [
        SystemMessage(state["system_prompt"]),
        HumanMessage(f"上下文数据\n{input_message}"),
    ]
    response = await llm.ainvoke(messages)
    return {"output": response}
