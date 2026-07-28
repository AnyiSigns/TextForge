import json
from typing import Dict, Any

from agents.state import ToolState
from repository.structured_repo import StructuredRepository
from repository.vector_repo import VectorRepository
from core.model_factory import ModelFactory
from infrastructure.database import db_manager


async def tool_node(state: ToolState) -> Dict[str, Any]:
    workflow_node = state.get("workflow_node")
    project_id = state.get("project_id")
    query_text = state.get("query", "")
    model_config = state.get("model_config")

    if not workflow_node:
        return {"tool_result": "错误：缺少 workflow_node 配置"}

    raw_results = {
        "structured": {},
        "rag": []
    }

    async with db_manager.get_session() as session:
        if workflow_node.context_fields:
            structured_repo = StructuredRepository(session)
            raw_results["structured"] = await structured_repo.query_by_fields(
                project_id=project_id,
                context_fields=workflow_node.context_fields
            )

        if workflow_node.rag_filter:
            llm = ModelFactory(model_config)
            embedding = await llm.embedding.aembed_query(query_text)

            vector_repo = VectorRepository(session)
            raw_results["rag"] = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter=workflow_node.rag_filter.model_dump(by_alias=True),
                top_k=workflow_node.rag_top_k or 3
            )

    formatted = _format_tool_result(raw_results)
    return {"tool_result": formatted}


def _format_tool_result(result: Dict[str, Any]) -> str:
    parts = []

    structured = result.get("structured", {})
    if structured:
        for table_name, records in structured.items():
            if not records:
                continue
            display_name = {
                "characters": "角色设定",
                "creative_settings": "创作设定",
                "outline": "大纲结构",
                "chapters": "章节信息",
            }.get(table_name, table_name)
            parts.append(f"## {display_name}（共 {len(records)} 条）")
            for rec in records[:10]:
                line = _format_record(rec, table_name)
                if line:
                    parts.append(f"- {line}")
            if len(records) > 10:
                parts.append(f"... 还有 {len(records) - 10} 条")

    rag = result.get("rag", [])
    if rag:
        parts.append("\n## 外部书籍参考片段")
        for i, item in enumerate(rag, 1):
            similarity = (1 - item['distance']) * 100
            parts.append(f"\n**[{i}] 《{item['doc_title']}》**")
            if item.get('doc_author'):
                parts.append(f"   作者：{item['doc_author']}")
            parts.append(f"   相关度：{similarity:.1f}%")
            parts.append(f"   {item['content'][:300]}...")

    return "\n\n".join(parts) if parts else "（无数据）"


def _format_record(record, table_name: str) -> str:
    try:
        if table_name == "characters":
            name = getattr(record, "name", "未知")
            role = getattr(record, "role_type", "")
            desc = getattr(record, "description", "")[:80]
            return f"{name}（{role}）：{desc}..."
        elif table_name == "creative_settings":
            worldview = getattr(record, "worldview", "")
            if worldview:
                return f"世界观：{worldview[:100]}..."
            tone = getattr(record, "tone", "")
            if tone:
                return f"文风基调：{tone[:80]}..."
        elif table_name == "outline":
            title = getattr(record, "title", "未命名")
            return f"{title}"
        elif table_name == "chapters":
            title = getattr(record, "title", "未命名")
            summary = getattr(record, "summary", "")[:50]
            return f"{title}：{summary}..."
    except Exception:
        return str(record)[:80]
    return str(record)[:80]
