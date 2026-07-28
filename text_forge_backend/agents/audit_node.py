from agents.state import AuditState
from core.model_factory import ModelFactory
import json
from langchain_core.messages import SystemMessage, HumanMessage


async def audit_node(state: AuditState):
    llm = ModelFactory(state["model_config"])
    context_block = "\n\n".join(
        [
            f"世界观设定\n:{state.get('input_worldview', '')}",
            f"角色设定：\n{state.get('input_characters', '')}",
            f"前情摘要：\n{state.get('input_brief_summary', '')}",
            f"最近章节正文：\n{state.get('input_recent_chapters', '')}",
        ]
    )
    print(f":{context_block}")
    task_input = json.dumps(state["input_context"], ensure_ascii=False, indent=2)
    messages = [
        SystemMessage(state["system_prompt"]),
        HumanMessage(f"项目上下文\n{context_block}\n\n当前任务输入：\n{task_input}"),
    ]
    response = await llm.audit.ainvoke(messages)
    return {"output": response.content}
