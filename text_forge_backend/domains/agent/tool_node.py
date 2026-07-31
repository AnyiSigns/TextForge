from typing import Dict, Any
from domains.agent.state import ToolState
from domains.book.structured_repo import StructuredRepository
from domains.knowledge.repository import VectorRepository
from core.model_factory import ModelFactory
from shared.database import db_manager


async def tool_node(state: ToolState) -> Dict[str, Any]:
    workflow_node = state.get("workflow_node")
    project_id = state.get("project_id")
    query_text = state.get("query", "")
    model_config = state.get("model_config")
    context_fields = state.get("context_fields") or []
    context_pool = state.get("context_pool") or {}

    if not workflow_node:
        return {"tool_result": "错误：缺少 workflow_node 配置"}

    raw_results = {"structured": {}, "rag": []}

    async with db_manager.with_db() as session:
        if context_fields:
            structured_repo = StructuredRepository(session)
            raw_results["structured"] = await structured_repo.query_by_fields(
                book_id=project_id,
                context_fields=context_fields,
                context_pool=context_pool,
            )

        if workflow_node.get("rag_filter"):
            llm = ModelFactory(model_config)
            embedding = await llm.embedding.aembed_query(query_text)

            vector_repo = VectorRepository(session)
            raw_results["rag"] = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter=workflow_node["rag_filter"],
                top_k=workflow_node.get("rag_top_k") or 3,
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
                "book_info": "书籍基本信息",
                "setting": "创作设定",
                "characters": "角色档案",
                "character_relationships": "角色关系",
                "chapter_content": "章节正文",
                "chapter_summaries": "章节摘要",
                "recent_chapters": "最近章节",
                "outline_structure": "大纲结构",
                "volumes": "卷信息",
            }.get(table_name, table_name)
            parts.append(f"## {display_name}（共 {len(records)} 条）")
            for rec in records[:10]:
                lines = _format_record(rec, table_name)
                if lines:
                    parts.append(lines)
            if len(records) > 10:
                parts.append(f"... 还有 {len(records) - 10} 条")

    rag = result.get("rag", [])
    if rag:
        parts.append("\n## 外部书籍参考片段")
        for i, item in enumerate(rag, 1):
            similarity = (1 - item["distance"]) * 100
            parts.append(f"\n**[{i}] 《{item['doc_title']}》**")
            if item.get("doc_author"):
                parts.append(f"   作者：{item['doc_author']}")
            parts.append(f"   相关度：{similarity:.1f}%")
            parts.append(f"   {item['content'][:300]}...")

    return "\n\n".join(parts) if parts else "（无数据）"


def _format_record(record, table_name: str):
    try:
        if table_name == "book_info":
            title = getattr(record, "title", "") or ""
            desc = getattr(record, "description", "") or ""
            genre = getattr(record, "genre", "") or ""
            return f"《{title}》类型：{genre}\n描述：{desc[:300]}"

        if table_name == "setting":
            lines = []
            w = getattr(record, "worldview", "") or ""
            t = getattr(record, "tone", "") or ""
            wt = getattr(record, "writing_taboos", "") or ""
            cd = getattr(record, "custom_dimensions", None) or {}
            if w:
                lines.append(f"世界观：{w[:1000]}")
            if t:
                lines.append(f"文风基调：{t[:1000]}")
            if wt:
                lines.append(f"创作禁忌：{wt[:1000]}")
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
            return "\n".join(lines) if lines else None

        if table_name == "characters":
            name = getattr(record, "name", "未知")
            role = getattr(record, "role_type", "") or ""
            desc = getattr(record, "description", "") or ""
            status = getattr(record, "status", "") or ""
            rels = getattr(record, "relationship_chain", None) or []
            parts = [f"- {name}（{role}）：{desc[:200]}"]
            if status:
                parts.append(f"  状态：{status}")
            if rels:
                rel_texts = []
                for rel in rels[:5]:
                    target = getattr(rel, "target", "") or ""
                    relation = getattr(rel, "relation", "") or ""
                    if target and relation:
                        rel_texts.append(f"{target}（{relation}）")
                if rel_texts:
                    parts.append(f"  关系：{'；'.join(rel_texts)}")
            return "\n".join(parts)

        if table_name == "character_relationships":
            name = getattr(record, "name", "未知")
            rels = getattr(record, "relationship_chain", None) or []
            rel_texts = []
            for rel in rels[:8]:
                target = getattr(rel, "target", "") or ""
                relation = getattr(rel, "relation", "") or ""
                if target and relation:
                    rel_texts.append(f"{target}（{relation}）")
            if rel_texts:
                return f"- {name}：{'；'.join(rel_texts)}"
            return f"- {name}：无关系数据"

        if table_name == "chapter_content":
            content = getattr(record, "content", "") or ""
            return content[:3000]

        if table_name == "chapter_summaries":
            title = getattr(record, "title", "未命名")
            summary = getattr(record, "summary", "") or ""
            return f"- {title}：{summary[:500]}"

        if table_name == "recent_chapters":
            title = getattr(record, "title", "未命名")
            summary = getattr(record, "summary", "") or ""
            content = getattr(record, "content", "") or ""
            text = f"- {title}"
            if summary:
                text += f"：{summary[:200]}"
            if content:
                text += f"\n  正文：{content[:3000]}"
            return text

        if table_name == "outline_structure":
            node_type = getattr(record, "node_type", "")
            title = getattr(record, "title", "未命名")
            content = getattr(record, "content", "") or ""
            return f"- [{node_type}] {title}：{content[:500]}"

        if table_name == "volumes":
            title = getattr(record, "title", "未命名")
            summary = getattr(record, "summary", "") or ""
            return f"- {title}：{summary[:500]}"
    except Exception:
        return str(record)[:200]
    return None
