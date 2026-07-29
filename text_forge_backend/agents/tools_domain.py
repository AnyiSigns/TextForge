from typing import Optional, List
from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from repository.character_repo import CharacterRepository
from repository.outline_repo import OutlineRepository
from repository.world_repo import WorldRepository
from repository.vector_repo import VectorRepository
from model.book import Book
from core.model_factory import ModelFactory
from service.web_search import WebSearchService
from utils.logger import get_logger
import json

logger = get_logger(__name__)


def _build_lookup_tools(session_factory):
    @tool
    async def lookup_characters(book_id: int, names: Optional[List[str]] = None) -> List[dict]:
        session = await session_factory()
        characters = await CharacterRepository(session).book_character_detail(user_id=0, book_id=book_id)
        if names:
            characters = [c for c in characters if c.name in names]
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "role_type": c.role_type,
                "status": c.status,
                "relationship_chain": c.relationship_chain or [],
            }
            for c in characters
        ]

    @tool
    async def lookup_outline(book_id: int, chapter_id: Optional[int] = None) -> List[dict]:
        session = await session_factory()
        outlines = await OutlineRepository(session).list_outlines(book_id)
        result = []
        for outline in outlines:
            try:
                content = outline.content or "[]"
                data = json.loads(content) if isinstance(content, str) else content
            except Exception:
                data = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                if chapter_id is not None:
                    chapter_ids = item.get("chapter_ids") or []
                    if str(chapter_id) not in {str(cid) for cid in chapter_ids}:
                        continue
                result.append({
                    "id": outline.id,
                    "node_type": outline.node_type,
                    "title": outline.title,
                    "content": item,
                })
        return result

    @tool
    async def lookup_locations(book_id: int, query: Optional[str] = None) -> List[dict]:
        session = await session_factory()
        locations = await WorldRepository(session).list_locations(book_id)
        if query:
            locations = [loc for loc in locations if query in (loc.name or "") or query in (loc.description or "")]
        return [
            {
                "id": loc.id,
                "name": loc.name,
                "type": loc.type,
                "description": loc.description,
                "parent_id": loc.parent_id,
                "attributes": loc.attributes or {},
            }
            for loc in locations
        ]

    @tool
    async def lookup_timeline(book_id: int, before_chapter: Optional[int] = None, limit: int = 20, query: Optional[str] = None) -> List[dict]:
        session = await session_factory()
        events = await WorldRepository(session).list_timeline_events(book_id)
        if before_chapter is not None:
            filtered = []
            for event in events:
                if event.chapter_id is None:
                    filtered.append(event)
                    continue
                try:
                    if int(event.chapter_id) <= int(before_chapter):
                        filtered.append(event)
                except Exception:
                    pass
            events = filtered
        if query:
            events = [ev for ev in events if query in (ev.name or "") or query in (ev.description or "")]
        return [
            {
                "id": ev.id,
                "name": ev.name,
                "description": ev.description,
                "sort_order": ev.sort_order,
                "chapter_id": ev.chapter_id,
                "event_type": ev.event_type,
                "related_character_ids": ev.related_character_ids or [],
                "related_location_id": ev.related_location_id,
            }
            for ev in events[:limit]
        ]

    @tool
    async def lookup_foreshadowing(book_id: int, status: str = "planted", query: Optional[str] = None) -> List[dict]:
        session = await session_factory()
        items = await WorldRepository(session).list_foreshadowings(book_id, status=status)
        if query:
            items = [item for item in items if query in (item.description or "")]
        return [
            {
                "id": item.id,
                "description": item.description,
                "status": item.status,
                "planted_at_chapter_id": item.planted_at_chapter_id,
                "resolved_at_chapter_id": item.resolved_at_chapter_id,
                "related_character_ids": item.related_character_ids or [],
                "related_event_id": item.related_event_id,
                "reveal_type": item.reveal_type,
                "notes": item.notes,
            }
            for item in items
        ]

    @tool
    async def lookup_plot_threads(book_id: int, status: str = "active", query: Optional[str] = None) -> List[dict]:
        session = await session_factory()
        items = await WorldRepository(session).list_plot_threads(book_id)
        if status:
            items = [item for item in items if item.status == status]
        if query:
            items = [item for item in items if query in (item.name or "") or query in (item.description or "")]
        return [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "status": item.status,
                "parent_thread_id": item.parent_thread_id,
                "type": item.type,
                "related_character_ids": item.related_character_ids or [],
                "start_chapter_id": item.start_chapter_id,
                "end_chapter_id": item.end_chapter_id,
                "progress_note": item.progress_note,
            }
            for item in items
        ]

    return [
        lookup_characters,
        lookup_outline,
        lookup_locations,
        lookup_timeline,
        lookup_foreshadowing,
        lookup_plot_threads,
    ]


def _build_agent_tools(session_factory, model_config: Optional[dict] = None):
    from agents.tools.memory_tools import save_memory, recall_memory, list_memories_by_type, forget_memory, update_memory
    lookup_tools = _build_lookup_tools(session_factory)

    @tool
    async def search_public_docs(book_id: int, query: str, target_book_id: Optional[int] = None, top_k: int = 5) -> List[dict]:
        session = await session_factory()
        vector_repo = VectorRepository(session)
        embedding = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"search_public_docs embedding 失败: {exc}")
        if embedding is None:
            return []
        rag_filter = {"query": query}
        if target_book_id is not None:
            rag_filter["doc_ids"] = [str(target_book_id)]
        items = await vector_repo.search_external_books(
            query_embedding=embedding,
            rag_filter=rag_filter,
            top_k=top_k,
        )
        return [
            {
                "doc_id": item.get("doc_id"),
                "doc_title": item.get("doc_title"),
                "doc_author": item.get("doc_author"),
                "content": item.get("content"),
                "score": 1 - float(item.get("distance", 0) or 0),
            }
            for item in items
        ]

    @tool
    async def personal_rag_search(user_id: int, query: str, top_k: int = 5) -> List[dict]:
        session = await session_factory()
        vector_repo = VectorRepository(session)
        embedding = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"personal_rag_search embedding 失败: {exc}")
        if embedding is None:
            return [{"title": "检索失败", "snippet": "embedding 模型不可用", "url": ""}]
        try:
            from sqlalchemy import select as sa_select
            from model.document import Document
            doc_stmt = sa_select(Document.id, Document.file_name).where(Document.user_id == user_id, Document.scope == "personal")
            doc_result = await session.execute(doc_stmt)
            doc_rows = doc_result.all()
            doc_ids = [str(row.id) for row in doc_rows]
            if not doc_ids:
                return []
            items = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter={"doc_ids": doc_ids},
                top_k=top_k,
            )
            return [
                {
                    "title": row.file_name,
                    "snippet": item.get("content", ""),
                    "url": "",
                    "score": 1 - float(item.get("distance", 0) or 0),
                }
                for item in items
                for row in doc_rows
                if str(row.id) == str(item.get("doc_id"))
            ]
        except Exception as exc:
            logger.warning(f"personal_rag_search 失败: {exc}")
            return [{"title": "检索失败", "snippet": str(exc), "url": ""}]

    @tool
    async def web_search(query: str, top_k: int = 5) -> List[dict]:
        session = await session_factory()
        api_key = ""
        if model_config:
            api_key = (((model_config or {}).get("search_config") or {}).get("api_key") or "")
        if not api_key:
            return [{"error": "未配置 search_config.api_key", "query": query}]
        service = WebSearchService(session)
        return await service.search(query=query, api_key=api_key, top_k=top_k, use_cache=True)

    @tool
    async def list_user_books(user_id: int) -> List[dict]:
        session = await session_factory()
        stmt = select(Book).where(Book.user_id == user_id).order_by(Book.id)
        result = await session.execute(stmt)
        books = result.scalars().all()
        return [
            {
                "id": b.id,
                "title": b.title,
                "genre": b.genre,
                "total_word_goal": b.total_word_goal,
                "current_word_count": b.current_word_count,
            }
            for b in books
        ]

    @tool
    async def get_book_context(user_id: int, book_id: int) -> dict:
        session = await session_factory()
        from sqlalchemy import select as sa_select
        from model.book import Book, Volume, Chapter, ChapterContent, Character
        book_stmt = sa_select(Book).where(Book.id == book_id, Book.user_id == user_id)
        book_result = await session.execute(book_stmt)
        book = book_result.scalar_one_or_none()
        if not book:
            return {"error": "书籍不存在或无权访问"}
        char_stmt = sa_select(Character).where(Character.book_id == book_id).order_by(Character.id)
        char_result = await session.execute(char_stmt)
        characters = char_result.scalars().all()
        vol_stmt = sa_select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
        vol_result = await session.execute(vol_stmt)
        volumes = vol_result.scalars().all()
        return {
            "book": {
                "id": book.id,
                "title": book.title,
                "description": book.description,
                "genre": book.genre,
            },
            "character_count": len(characters),
            "characters": [
                {"id": c.id, "name": c.name, "role_type": c.role_type}
                for c in characters
            ],
            "volume_count": len(volumes),
            "volumes": [
                {"id": v.id, "title": v.title, "summary": v.summary}
                for v in volumes
            ],
        }

    @tool
    async def auto_extract_entities(user_id: int, book_id: int, content: str) -> dict:
        if not content.strip():
            return {"book_id": book_id, "entities": [], "message": "内容为空，无需提取"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"auto_extract_entities 初始化模型失败: {exc}")
        if llm is None:
            return {"book_id": book_id, "entities": [], "message": "模型未配置，跳过提取"}
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import JsonOutputParser
        from langchain_core.messages import SystemMessage
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""你是实体提取助手。从给定文本中提取人物、地点、事件。
输出 JSON 格式：
{
  "characters": [{"name": "姓名", "description": "描述", "role_type": "角色类型"}],
  "locations": [{"name": "地点名", "type": "类型", "description": "描述"}],
  "events": [{"name": "事件名", "description": "描述", "event_type": "类型"}]
}
只输出 JSON，不要其他内容。"""),
            ("human", "{content}"),
        ])
        try:
            chain = prompt | llm.main | JsonOutputParser()
            result = await chain.ainvoke({"content": content[:4000]})
        except Exception as exc:
            logger.warning(f"auto_extract_entities 提取失败: {exc}")
            return {"book_id": book_id, "entities": [], "message": f"提取失败: {exc}"}
        entities = {"characters": [], "locations": [], "events": []}
        if isinstance(result, dict):
            entities["characters"] = result.get("characters", []) or []
            entities["locations"] = result.get("locations", []) or []
            entities["events"] = result.get("events", []) or []
        return {"book_id": book_id, "entities": entities}

    @tool
    async def batch_create_entities(book_id: int, characters: Optional[List[dict]] = None, locations: Optional[List[dict]] = None, timeline_events: Optional[List[dict]] = None) -> dict:
        session = await session_factory()
        repo = WorldRepository(session)
        created = {"characters": [], "locations": [], "timeline_events": []}
        try:
            for item in (characters or []):
                from model.book import Character
                instance = Character(book_id=book_id, **item)
                session.add(instance)
                created["characters"].append(item)
            for item in (locations or []):
                instance = await repo.create_location(book_id, item)
                created["locations"].append({"id": instance.id, "name": instance.name})
            for item in (timeline_events or []):
                instance = await repo.create_timeline_event(book_id, item)
                created["timeline_events"].append({"id": instance.id, "name": instance.name})
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.warning(f"batch_create_entities 失败: {exc}")
            return {"book_id": book_id, "created": created, "message": f"部分创建失败: {exc}"}
        return {"book_id": book_id, "created": created, "message": "批量创建完成"}

    @tool
    async def update_foreshadowing(item_id: int, book_id: int, data: dict) -> dict:
        session = await session_factory()
        instance = await WorldRepository(session).update_foreshadowing(item_id, book_id, data)
        if not instance:
            return {"error": "伏笔不存在", "item_id": item_id}
        return {"id": instance.id, "description": instance.description, "status": instance.status, "resolved_at_chapter_id": instance.resolved_at_chapter_id}

    @tool
    async def update_plot_thread(item_id: int, book_id: int, data: dict) -> dict:
        session = await session_factory()
        instance = await WorldRepository(session).update_plot_thread(item_id, book_id, data)
        if not instance:
            return {"error": "情节脉络不存在", "item_id": item_id}
        return {"id": instance.id, "name": instance.name, "status": instance.status, "progress_note": instance.progress_note}

    @tool
    async def update_timeline(item_id: int, book_id: int, data: dict) -> dict:
        session = await session_factory()
        instance = await WorldRepository(session).update_timeline_event(item_id, book_id, data)
        if not instance:
            return {"error": "时间线事件不存在", "item_id": item_id}
        return {"id": instance.id, "name": instance.name, "description": instance.description, "event_type": instance.event_type}

    @tool
    async def polish_text(text: str, instruction: str = "") -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"polish_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法润色"}
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.messages import SystemMessage, HumanMessage
        system = SystemMessage(content="你是专业的文字润色助手。改进文本的表达、节奏和可读性，保持原意不变。直接输出润色后的文本。")
        human = HumanMessage(content=f"请润色以下文本：\n{text[:4000]}\n润色要求：{instruction or '优化表达'}")
        try:
            result = await llm.main.ainvoke([system, human])
            polished = result.content if hasattr(result, "content") else str(result)
            return {"original_length": len(text), "polished_length": len(polished), "polished_text": polished}
        except Exception as exc:
            logger.error(f"polish_text 失败: {exc}", exc_info=True)
            return {"error": f"润色失败: {exc}"}

    @tool
    async def rewrite_paragraph(text: str, instruction: str = "") -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"rewrite_paragraph 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法改写"}
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.messages import SystemMessage, HumanMessage
        system = SystemMessage(content="你是专业的改写助手。根据用户指令改写文本，保持核心含义但改变表达方式。直接输出改写后的文本。")
        human = HumanMessage(content=f"请改写以下文本：\n{text[:4000]}\n改写要求：{instruction or '换个角度重写'}")
        try:
            result = await llm.main.ainvoke([system, human])
            rewritten = result.content if hasattr(result, "content") else str(result)
            return {"original_length": len(text), "rewritten_length": len(rewritten), "rewritten_text": rewritten}
        except Exception as exc:
            logger.error(f"rewrite_paragraph 失败: {exc}", exc_info=True)
            return {"error": f"改写失败: {exc}"}

    @tool
    async def expand_text(text: str, target_length: Optional[int] = None) -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"expand_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法扩写"}
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.messages import SystemMessage, HumanMessage
        target = target_length or len(text) * 3
        system = SystemMessage(content="你是专业的扩写助手。在保持原意和风格的基础上，丰富细节、描写和对话，使文本更加生动。直接输出扩写后的文本。")
        human = HumanMessage(content=f"请扩写以下文本，目标字数约 {target} 字：\n{text[:4000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            expanded = result.content if hasattr(result, "content") else str(result)
            return {"original_length": len(text), "expanded_length": len(expanded), "expanded_text": expanded}
        except Exception as exc:
            logger.error(f"expand_text 失败: {exc}", exc_info=True)
            return {"error": f"扩写失败: {exc}"}

    @tool
    async def summarize_selected(text: str, max_length: Optional[int] = None) -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"summarize_selected 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法总结"}
        from langchain_core.messages import SystemMessage, HumanMessage
        target = max_length or 200
        system = SystemMessage(content="你是专业的摘要助手。请简洁地总结文本内容，保留关键信息和核心情节。")
        human = HumanMessage(content=f"请将以下文本总结为 {target} 字以内的摘要：\n{text[:6000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            summary = result.content if hasattr(result, "content") else str(result)
            return {"original_length": len(text), "summary_length": len(summary), "summary": summary}
        except Exception as exc:
            logger.error(f"summarize_selected 失败: {exc}", exc_info=True)
            return {"error": f"总结失败: {exc}"}

    @tool
    async def suggest_alternatives(text: str, position: Optional[int] = None, count: int = 3) -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"suggest_alternatives 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法生成建议"}
        from langchain_core.messages import SystemMessage, HumanMessage
        system = SystemMessage(content="你是写作建议助手。针对给定文本，提供多个不同风格的改写建议。")
        human = HumanMessage(content=f"请提供 {count} 种不同风格的改写建议：\n{text[:4000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            alternatives = result.content if hasattr(result, "content") else str(result)
            return {"alternatives": alternatives, "count": count}
        except Exception as exc:
            logger.error(f"suggest_alternatives 失败: {exc}", exc_info=True)
            return {"error": f"生成建议失败: {exc}"}

    @tool
    async def check_consistency(book_id: int, chapter_id: Optional[int] = None) -> dict:
        session = await session_factory()
        from model.book import Book, Chapter, ChapterContent, Character
        from repository.character_repo import CharacterRepository
        from repository.world_repo import WorldRepository
        book_stmt = select(Book).where(Book.id == book_id)
        book_result = await session.execute(book_stmt)
        book = book_result.scalar_one_or_none()
        if not book:
            return {"error": "书籍不存在"}
        characters = await CharacterRepository(session).book_character_detail(user_id=book.user_id, book_id=book_id)
        locations = await WorldRepository(session).list_locations(book_id)
        timeline_events = await WorldRepository(session).list_timeline_events(book_id)
        content = ""
        if chapter_id:
            content_stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.version.desc()).limit(1)
            content_result = await session.execute(content_stmt)
            content_obj = content_result.scalar_one_or_none()
            if content_obj:
                content = content_obj.content or ""
        if not content:
            return {"error": "无正文内容可检查"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"check_consistency 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法检查一致性"}
        from langchain_core.messages import SystemMessage, HumanMessage
        system = SystemMessage(content="你是 consistency 检查助手。检查正文中的人物、地点、时间线是否与设定一致。列出不一致的地方。")
        human = HumanMessage(content=f"书籍：{book.title}\n人物：{[c.name for c in characters]}\n地点：{[loc.name for loc in locations]}\n时间线：{[ev.name for ev in timeline_events]}\n\n请检查以下正文中的一致性：\n{content[:4000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            issues = result.content if hasattr(result, "content") else str(result)
            return {"chapter_id": chapter_id, "issues": issues, "checked_length": len(content)}
        except Exception as exc:
            logger.error(f"check_consistency 失败: {exc}", exc_info=True)
            return {"error": f"检查失败: {exc}"}

    @tool
    async def check_grammar(text: str) -> dict:
        if not text.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"check_grammar 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法检查语法"}
        from langchain_core.messages import SystemMessage, HumanMessage
        system = SystemMessage(content="你是语法检查助手。检查文本中的语法、拼写和标点错误，列出问题并给出修正建议。")
        human = HumanMessage(content=f"请检查以下文本的语法错误：\n{text[:4000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            issues = result.content if hasattr(result, "content") else str(result)
            return {"checked_length": len(text), "issues": issues}
        except Exception as exc:
            logger.error(f"check_grammar 失败: {exc}", exc_info=True)
            return {"error": f"检查失败: {exc}"}

    @tool
    async def search_across_books(user_id: int, query: str, top_k: int = 5) -> List[dict]:
        session = await session_factory()
        vector_repo = VectorRepository(session)
        embedding = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"search_across_books embedding 失败: {exc}")
        if embedding is None:
            return [{"error": "embedding 模型不可用", "query": query}]
        try:
            from sqlalchemy import select as sa_select
            from model.document import Document
            doc_stmt = sa_select(Document.id, Document.file_name, Document.book_id).where(Document.user_id == user_id)
            doc_result = await session.execute(doc_stmt)
            doc_rows = doc_result.all()
            doc_ids = [str(row.id) for row in doc_rows]
            if not doc_ids:
                return []
            items = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter={"doc_ids": doc_ids, "query": query},
                top_k=top_k,
            )
            doc_map = {str(row.id): row.file_name for row in doc_rows}
            return [
                {
                    "doc_id": item.get("doc_id"),
                    "doc_title": doc_map.get(str(item.get("doc_id")), ""),
                    "content": item.get("content"),
                    "score": 1 - float(item.get("distance", 0) or 0),
                }
                for item in items
            ]
        except Exception as exc:
            logger.warning(f"search_across_books 失败: {exc}")
            return [{"error": str(exc), "query": query}]

    return lookup_tools + [
        search_public_docs,
        personal_rag_search,
        web_search,
        list_user_books,
        get_book_context,
        save_memory,
        recall_memory,
        list_memories_by_type,
        forget_memory,
        update_memory,
        auto_extract_entities,
        batch_create_entities,
        update_foreshadowing,
        update_plot_thread,
        update_timeline,
        polish_text,
        rewrite_paragraph,
        expand_text,
        summarize_selected,
        suggest_alternatives,
        check_consistency,
        check_grammar,
        search_across_books,
    ]


def build_tool_node(session_factory, model_config: Optional[dict] = None):
    from langgraph.prebuilt import ToolNode
    from agents.tools.generate_chapter_tool import build_generate_chapter_tool
    from agents.tools.feedback_tools import _build_feedback_tools
    tools = _build_agent_tools(session_factory, model_config=model_config)
    tools.append(build_generate_chapter_tool(session_factory, model_config=model_config))
    tools.extend(_build_feedback_tools(session_factory, model_config=model_config))
    return ToolNode(tools)
