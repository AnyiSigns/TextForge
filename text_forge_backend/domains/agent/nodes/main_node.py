import json
from typing import Dict, Any

from ..state import MainState
from domains.book.structured_repository import StructuredRepository
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import StreamWriter
from shared.database import db_manager

from .context_formatter import format_context_field


async def main_node(state: MainState, writer: StreamWriter) -> dict:
    llm = ModelFactory(state["model_config"])
    context_fields = state.get("context_fields") or []
    context_pool = state.get("context_pool") or {}
    project_id = state.get("project_id")
    parts = []

    if context_fields and project_id:
        async with db_manager.with_db() as session:
            repo = StructuredRepository(session)
            raw = await repo.query_by_fields(
                book_id=project_id,
                context_fields=context_fields,
                context_pool=context_pool,
            )
        for field, records in raw.items():
            if not records:
                continue
            text = format_context_field(field, records)
            if text:
                parts.append(text)

    input_message = "\n\n".join(parts) if parts else "（无上下文）"
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
