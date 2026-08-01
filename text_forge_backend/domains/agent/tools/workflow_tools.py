from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.tools import tool
from sqlalchemy import select

logger = get_logger(__name__)

STRUCTURED_CONTEXT_FIELDS = [
    "characters",
    "outline",
    "chapter_content",
    "locations",
    "timeline_events",
    "foreshadowings",
    "plot_threads",
    "creative_settings",
    "volumes",
    "chapters",
    "book_info",
]


async def _query_structured_context(
    session, book_id: int, user_id: int, context_fields: list[str]
) -> dict[str, Any]:
    result = {}
    try:
        from models.book import Book, CreativeSetting
        if "book_info" in context_fields:
            stmt = select(Book).where(Book.id == book_id)
            r = await session.execute(stmt)
            book = r.scalar_one_or_none()
            if book:
                result["book_info"] = {
                    "title": book.title,
                    "genre": book.genre,
                    "description": book.description,
                }
        if "characters" in context_fields:
            from domains.book.repository import CharacterRepository
            chars = await CharacterRepository(session).book_character_detail(
                user_id=user_id, book_id=book_id
            )
            result["characters"] = [
                {"id": c.id, "name": c.name, "description": c.description, "role_type": c.role_type, "status": c.status}
                for c in chars
            ]
        if "outline" in context_fields:
            from domains.book.outline_repository import OutlineRepository
            outlines = await OutlineRepository(session).list_outlines(book_id)
            result["outline"] = [
                {"id": o.id, "title": o.title, "node_type": o.node_type, "content": o.content}
                for o in outlines
            ]
        if "locations" in context_fields:
            from domains.world.repository import WorldRepository
            locs = await WorldRepository(session).list_locations(book_id)
            result["locations"] = [
                {"id": loc.id, "name": loc.name, "type": loc.type, "description": loc.description}
                for loc in locs
            ]
        if "timeline_events" in context_fields:
            from domains.world.repository import WorldRepository
            events = await WorldRepository(session).list_timeline_events(book_id)
            result["timeline_events"] = [
                {"id": e.id, "name": e.name, "description": e.description, "event_type": e.event_type, "chapter_id": e.chapter_id}
                for e in events[:30]
            ]
        if "foreshadowings" in context_fields:
            from domains.world.repository import WorldRepository
            items = await WorldRepository(session).list_foreshadowings(book_id)
            result["foreshadowings"] = [
                {"id": i.id, "description": i.description, "status": i.status, "planted_at_chapter_id": i.planted_at_chapter_id}
                for i in items
            ]
        if "plot_threads" in context_fields:
            from domains.world.repository import WorldRepository
            items = await WorldRepository(session).list_plot_threads(book_id)
            result["plot_threads"] = [
                {"id": i.id, "name": i.name, "description": i.description, "status": i.status, "type": i.type}
                for i in items
            ]
        if "creative_settings" in context_fields:
            stmt = select(CreativeSetting).where(CreativeSetting.book_id == book_id)
            r = await session.execute(stmt)
            cs = r.scalar_one_or_none()
            if cs:
                result["creative_settings"] = {
                    "tone": cs.tone,
                    "worldview": cs.worldview,
                    "writing_taboos": cs.writing_taboos,
                }
    except Exception as exc:
        logger.warning(f"_query_structured_context 部分失败: {exc}")
    return result


async def _query_rag_context(
    session, book_id: int, user_id: int, rag_queries: list[dict], model_config: dict
) -> dict[str, Any]:
    result = {}
    if not rag_queries:
        return result
    try:
        from domains.knowledge.repository import VectorRepository
        vector_repo = VectorRepository(session)
        for rq in rag_queries:
            query = rq.get("query", "")
            kb = rq.get("knowledge_base", "全库")
            top_k = rq.get("top_k", 5)
            if not query:
                continue
            embedding = None
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"_query_rag_context embedding 失败: {exc}")
                continue
            rag_filter = {"query": query}
            if kb == "设定库":
                rag_filter["doc_ids"] = [str(book_id)]
            items = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter=rag_filter,
                top_k=top_k,
            )
            result[f"rag_{kb}"] = [
                {"content": i.get("content", ""), "doc_title": i.get("doc_title", ""), "score": 1 - float(i.get("distance", 0) or 0)}
                for i in (items or [])
            ]
    except Exception as exc:
        logger.warning(f"_query_rag_context 失败: {exc}")
    return result


def build_workflow_tool(session_factory, model_config: dict | None = None):
    @tool
    async def execute_workflow_node(
        workflow_id: str,
        node_id: str,
        book_id: int,
        user_id: int,
        context_fields: list[str] | None = None,
        rag_queries: list[dict] | None = None,
        web_search_queries: list[str] | None = None,
        upstream_outputs: dict | None = None,
    ) -> dict:
        async with session_factory() as session:
            from models.workflow import Workflow

            wf_stmt = select(Workflow).where(Workflow.id == workflow_id)
            wf_result = await session.execute(wf_stmt)
            workflow = wf_result.scalar_one_or_none()
            if not workflow:
                return {"status": "error", "message": f"工作流不存在: {workflow_id}"}

            nodes = workflow.nodes or []
            node = next((n for n in nodes if n.get("id") == node_id), None)
            if not node:
                return {"status": "error", "message": f"节点不存在: {node_id}"}

            node_label = node.get("label") or node.get("name") or node_id
            executor_type = node.get("executor", "main")
            system_prompt = node.get("system_prompt", "")
            node_config = node.get("config", {}) or {}

            structured = {}
            rag = {}
            if context_fields:
                structured = await _query_structured_context(session, book_id, user_id, context_fields)
            if rag_queries and model_config:
                rag = await _query_rag_context(session, book_id, user_id, rag_queries, model_config)

            context_parts = []
            for field_name, data in structured.items():
                context_parts.append(f"\n[{field_name}]\n{_format_context_value(data)}")
            for rag_key, items in rag.items():
                snippets = "\n".join([
                    f"  [{item.get('doc_title', '')}] {item.get('content', '')[:500]}"
                    for item in items
                ])
                context_parts.append(f"\n[RAG: {rag_key}]\n{snippets}")

            upstream_text = ""
            if upstream_outputs:
                for uid, text in upstream_outputs.items():
                    upstream_text += f"\n[上游节点 {uid} 输出]\n{text[:3000]}\n"

            full_context = "\n".join(context_parts)
            if upstream_text:
                full_context = upstream_text + "\n" + full_context

            llm = ModelFactory(model_config or {})
            from langchain_core.messages import HumanMessage, SystemMessage

            system = SystemMessage(content=system_prompt or "你是一个专业的创作AI。根据上下文生成内容。直接输出创作内容，不要多余解释。")
            human_content = full_context or f"请为书籍 book_id={book_id} 创作内容。"
            human = HumanMessage(content=human_content)

            stream_events: list[dict[str, Any]] = []
            output_tokens = 0
            generated_text = ""

            try:
                async for chunk in llm.main.astream([system, human]):
                    token = chunk.content if hasattr(chunk, "content") else str(chunk)
                    if token:
                        generated_text += token
                        output_tokens += 1
                        stream_events.append({
                            "node_id": node_id,
                            "token": token,
                            "index": len(stream_events),
                        })
            except Exception:
                logger.exception(f"execute_workflow_node {node_id} LLM 流式调用失败")
                return {"status": "error", "message": "节点执行失败，请稍后重试"}

            return {
                "node_id": node_id,
                "node_label": node_label,
                "output": generated_text,
                "stream_events": stream_events,
                "tokens": output_tokens,
                "status": "completed",
            }

    return execute_workflow_node


def _format_context_value(value: Any) -> str:
    if isinstance(value, str):
        return value[:3000]
    if isinstance(value, (list, tuple)):
        return "\n".join([str(item) for item in value[:20]])
    if isinstance(value, dict):
        return str(value)[:3000]
    return str(value)[:3000]
