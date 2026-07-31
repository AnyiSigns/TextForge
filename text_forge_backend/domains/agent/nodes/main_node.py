import json
from typing import Dict, Any

from ..state import MainState
from domains.book.structured_repository import StructuredRepository
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import StreamWriter
from shared.database import db_manager


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
            text = _format_context_field(field, records)
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


def _format_context_field(field: str, records: list) -> str:
    if field == "book_info":
        lines = []
        for r in records:
            title = getattr(r, "title", "") or ""
            desc = getattr(r, "description", "") or ""
            genre = getattr(r, "genre", "") or ""
            lines.append(f"《{title}》类型：{genre}\n描述：{desc[:300]}")
        return "\n".join(lines)

    if field == "setting":
        lines = []
        for r in records:
            w = getattr(r, "worldview", "") or ""
            t = getattr(r, "tone", "") or ""
            wt = getattr(r, "writing_taboos", "") or ""
            cd = getattr(r, "custom_dimensions", None) or {}
            if w:
                lines.append(f"# 世界观\n{w}")
            if t:
                lines.append(f"# 文风/基调\n{t}")
            if wt:
                lines.append(f"# 创作禁忌\n{wt}")
            if cd:
                for k, v in cd.items():
                    if isinstance(v, str):
                        lines.append(f"{k}：{v}")
                    elif isinstance(v, (int, float)):
                        lines.append(f"{k}：{v}")
                    elif isinstance(v, list):
                        lines.append(f"{k}：{', '.join(str(x) for x in v)}")
                    else:
                        lines.append(f"{k}：{str(v)}")
        return "\n\n".join(lines)

    if field == "characters":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            role = getattr(r, "role_type", "") or ""
            desc = getattr(r, "description", "") or ""
            lines.append(f"-{name}:{desc}")
        return "角色设定\n" + "\n".join(lines)

    if field == "character_relationships":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            rels = getattr(r, "relationship_chain", None) or []
            rel_texts = []
            for rel in rels[:8]:
                target = getattr(rel, "target", "") or ""
                relation = getattr(rel, "relation", "") or ""
                if target and relation:
                    rel_texts.append(f"{target}（{relation}）")
            if rel_texts:
                lines.append(f"- {name}：{'；'.join(rel_texts)}")
            else:
                lines.append(f"- {name}：无关系数据")
        return "\n".join(lines)

    if field == "chapter_content":
        blocks = []
        for r in records:
            title = getattr(r, "chapter", {}).title if hasattr(r, "chapter") else ""
            content = getattr(r, "content", "") or ""
            blocks.append(f"# {title}\n{content[:3000]}")
        return "\n\n".join(blocks)

    if field == "chapter_summaries":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary}")
        return "\n".join(lines)

    if field == "recent_chapters":
        blocks = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            content = getattr(r, "content", "") or ""
            block = f"# {title}"
            if summary:
                block += f"\n{summary}"
            if content:
                block += f"\n{content[:3000]}"
            blocks.append(block)
        return "\n\n".join(blocks)

    if field == "outline_structure":
        lines = []
        for r in records:
            node_type = getattr(r, "node_type", "")
            title = getattr(r, "title", "未命名")
            content = getattr(r, "content", "") or ""
            lines.append(f"- [{node_type}] {title}：{content[:500]}")
        return "\n".join(lines)

    if field == "volumes":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary[:500]}")
        return "\n".join(lines)

    return ""
