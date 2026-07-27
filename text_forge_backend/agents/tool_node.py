from agents.state import ToolState
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage


async def tool_node(state: ToolState):
    llm = ModelFactory(state["model_config"])
    system_prompt = "你是工具使用助手,可以进行联网搜索、知识库"
    input_prompt = f"查询:{state['query'][:30]}..."
    messages = [SystemMessage(system_prompt), HumanMessage(input_prompt)]
    response = await llm.tool.ainvoke(messages)
    return {"tool_result": response.content}
