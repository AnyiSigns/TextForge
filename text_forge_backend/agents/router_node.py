import json
import re
from core.model_factory import ModelFactory
from agents.state import RouterState
from config.agent_conf import EXECUTOR_PROMPT
from langchain_core.messages import SystemMessage, HumanMessage


async def router_node(state: RouterState):
    llm = ModelFactory(state["model_config"])
    input_msg = f"""
    任务名称:{state['task_label']}；
    任务提示词:{state['task_prompt']}。
    请根据上述任务特征选择最合适的执行器
    """
    messages = [SystemMessage(EXECUTOR_PROMPT), HumanMessage(input_msg)]
    chunks = []
    async for chunk in llm.router.astream(messages):
        chunks.append(chunk.content)
    response_content = "".join(chunks)
    try:
        print(f"----执行器:{response.content}")
        json_match = re.search(r"\{[^}]*\}", response.content)  # type: ignore
        if json_match:
            decision = json.loads(json_match.group())
        else:
            decision = {"executor": "main"}
    except:
        decision = {"executor": "main"}
    return {"decision": json.dumps(decision)}
