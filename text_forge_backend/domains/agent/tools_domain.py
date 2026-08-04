import json
from typing import Annotated

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from models.book import Book, Chapter, Volume
from sqlalchemy import select

from domains.book.repository import CharacterRepository
from domains.knowledge.repository import VectorRepository
from domains.world.repository import WorldRepository

from .web_search_service import WebSearchService

logger = get_logger(__name__)


def _build_lookup_tools(session_factory):
    @tool
    async def lookup_characters(
        names: Annotated[list[str] | None, "要查询的角色名称列表，为空则返回全部角色"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的角色信息，可按名称筛选。

        Args:
            names: 要查询的角色名称列表，为空则返回当前书籍的全部角色。
        """
        logger.debug(f"[tool] lookup_characters  user_id={user_id}  book_id={book_id}  names={names}")
        async with session_factory() as session:
            characters = await CharacterRepository(session).book_character_detail(user_id=user_id, book_id=book_id)
            if names:
                characters = [c for c in characters if c.name in names]
            return [
                {
                    "id": c.id, "name": c.name, "aliases": c.aliases or [],
                    "description": c.description, "role_type": c.role_type,
                    "status": c.status, "relationship_chain": c.relationship_chain or [],
                    "avatar_url": c.avatar_url, "locked": c.locked,
                }
                for c in characters
            ]

    @tool
    async def lookup_outline(
        chapter_id: Annotated[int | None, "指定章节ID，为空则返回全部章节"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍的大纲结构，返回卷和章节信息。

        Args:
            chapter_id: 指定要查询的章节ID，为空则返回全部章节。
        """
        logger.debug(f"[tool] lookup_outline  book_id={book_id}  chapter_id={chapter_id}")
        async with session_factory() as session:
            vol_stmt = select(Chapter.volume_id).join(Chapter.volume).join(Volume.book).where(Book.id == book_id)
            vol_res = await session.execute(vol_stmt)
            vol_ids = list({r[0] for r in vol_res.fetchall()})
            if not vol_ids:
                return []
            ch_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids)).order_by(Chapter.sort_order, Chapter.id)
            ch_res = await session.execute(ch_stmt)
            chapters = ch_res.scalars().all()
            if chapter_id is not None:
                chapters = [c for c in chapters if c.id == chapter_id]
            return [
                {
                    "id": c.id, "title": c.title, "content": "",
                    "summary": c.summary or "", "sort_order": c.sort_order,
                    "character_ids": c.character_ids or [], "locked": c.locked,
                }
                for c in chapters
            ]

    @tool
    async def lookup_locations(
        query: Annotated[str | None, "搜索关键词，匹配地点名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的地点信息，可按关键词搜索。

        Args:
            query: 搜索关键词，匹配地点名称或描述，为空则返回全部地点。
        """
        logger.debug(f"[tool] lookup_locations  book_id={book_id}  query={query}")
        async with session_factory() as session:
            locations = await WorldRepository(session).list_locations(book_id)
            if query:
                locations = [loc for loc in locations if query in (loc.name or "") or query in (loc.description or "")]
            return [
                {
                    "id": loc.id, "name": loc.name, "type": loc.type,
                    "description": loc.description, "parent_id": loc.parent_id,
                    "attributes": loc.attributes or {}, "locked": loc.locked,
                }
                for loc in locations
            ]

    @tool
    async def lookup_timeline(
        before_chapter: Annotated[int | None, "只返回在此章节之前的事件"] = None,
        limit: Annotated[int, "返回结果数量上限"] = 20,
        query: Annotated[str | None, "搜索关键词，匹配事件名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍的时间线事件，可按章节位置和关键词筛选。

        Args:
            before_chapter: 只返回在此章节ID之前的事件，为空则不过滤。
            limit: 返回结果的最大数量。
            query: 搜索关键词，匹配事件名称或描述。
        """
        logger.debug(f"[tool] lookup_timeline  book_id={book_id}  before={before_chapter}  limit={limit}")
        async with session_factory() as session:
            events = await WorldRepository(session).list_scene_events(book_id)
            if before_chapter is not None:
                filtered = []
                for event in events:
                    if event.chapter_id is None:
                        filtered.append(event)
                        continue
                    try:
                        if int(event.chapter_id) <= int(before_chapter):
                            filtered.append(event)
                    except Exception as exc:
                        logger.warning(f"过滤 timeline 事件 chapter_id 转换失败: {exc}")
                events = filtered
            if query:
                events = [ev for ev in events if query in (ev.name or "") or query in (ev.description or "")]
            return [
                {
                    "id": ev.id, "name": ev.name, "description": ev.description,
                    "sort_order": ev.sort_order, "chapter_id": ev.chapter_id,
                    "event_type": ev.event_type, "related_character_ids": ev.related_character_ids or [],
                    "related_location_id": ev.related_location_id, "locked": ev.locked,
                }
                for ev in events[:limit]
            ]

    @tool
    async def lookup_foreshadowing(
        status: Annotated[str, "伏笔状态筛选：planted/resolved/abandoned"] = "planted",
        query: Annotated[str | None, "搜索关键词，匹配伏笔描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的伏笔信息，可按状态和关键词筛选。

        Args:
            status: 伏笔状态筛选，可选 planted（已埋下）、resolved（已回收）、abandoned（已放弃）。
            query: 搜索关键词，匹配伏笔描述。
        """
        logger.debug(f"[tool] lookup_foreshadowing  book_id={book_id}  status={status}")
        async with session_factory() as session:
            items = await WorldRepository(session).list_foreshadowings(book_id, status=status)
            if query:
                items = [item for item in items if query in (item.description or "")]
            return [
                {
                    "id": item.id, "description": item.description, "status": item.status,
                    "planted_at_chapter_id": item.planted_at_chapter_id,
                    "resolved_at_chapter_id": item.resolved_at_chapter_id,
                    "related_character_ids": item.related_character_ids or [],
                    "related_event_id": item.related_event_id,
                    "reveal_type": item.reveal_type, "notes": item.notes, "locked": item.locked,
                }
                for item in items
            ]

    @tool
    async def lookup_plot_threads(
        status: Annotated[str, "线索状态筛选：active/completed/paused"] = "active",
        query: Annotated[str | None, "搜索关键词，匹配线索名称或描述"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """查询书籍中的剧情线索，可按状态和关键词筛选。

        Args:
            status: 线索状态筛选，可选 active（进行中）、completed（已完成）、paused（暂停）。
            query: 搜索关键词，匹配线索名称或描述。
        """
        logger.debug(f"[tool] lookup_plot_threads  book_id={book_id}  status={status}")
        async with session_factory() as session:
            items = await WorldRepository(session).list_plot_threads(book_id)
            if status:
                items = [item for item in items if item.status == status]
            if query:
                items = [item for item in items if query in (item.name or "") or query in (item.description or "")]
            return [
                {
                    "id": item.id, "name": item.name, "description": item.description,
                    "status": item.status, "parent_thread_id": item.parent_thread_id,
                    "type": item.type, "related_character_ids": item.related_character_ids or [],
                    "start_chapter_id": item.start_chapter_id, "end_chapter_id": item.end_chapter_id,
                    "progress_note": item.progress_note, "locked": item.locked,
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


def _build_agent_tools(session_factory, model_config: dict | None = None):
    from .tools.memory_tools import (
        forget_memory,
        list_memories_by_type,
        recall_memory,
        save_memory,
        update_memory,
    )
    lookup_tools = _build_lookup_tools(session_factory)

    @tool
    async def search_public_docs(
        query: Annotated[str, "搜索关键词"],
        target_book_id: Annotated[int | None, "目标书籍ID，为空则跨全部公开文档搜索"] = None,
        top_k: Annotated[int, "返回结果数量"] = 5,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """搜索公开文档内容，使用语义检索。

        Args:
            query: 搜索关键词。
            target_book_id: 限定在指定书籍ID的文档中搜索，为空则跨全部文档。
            top_k: 返回结果数量上限。
        """
        logger.debug(f"[tool] search_public_docs  book_id={book_id}  query={query}  target={target_book_id}")
        async with session_factory() as session:
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
    async def personal_rag_search(
        query: Annotated[str, "搜索关键词"],
        top_k: Annotated[int, "返回结果数量"] = 5,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
    ) -> list[dict]:
        """搜索用户的个人知识库文档，使用语义检索。

        Args:
            query: 搜索关键词。
            top_k: 返回结果数量上限。
        """
        logger.debug(f"[tool] personal_rag_search  user_id={user_id}  query={query}")
        async with session_factory() as session:
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
                from models.document import Document
                from sqlalchemy import select as sa_select
                doc_stmt = sa_select(Document.id, Document.file_name).where(Document.user_id == user_id, Document.scope == "personal")
                doc_result = await session.execute(doc_stmt)
                doc_rows = doc_result.all()
                doc_id_map = {str(row.id): row.file_name for row in doc_rows}
                doc_ids = list(doc_id_map.keys())
                if not doc_ids:
                    return []
                items = await vector_repo.search_external_books(
                    query_embedding=embedding,
                    rag_filter={"doc_ids": doc_ids},
                    top_k=top_k,
                )
                return [
                    {
                        "title": doc_id_map.get(str(item.get("doc_id")), ""),
                        "snippet": item.get("content", ""),
                        "url": "",
                        "score": 1 - float(item.get("distance", 0) or 0),
                    }
                    for item in items
                    if str(item.get("doc_id")) in doc_id_map
                ]
            except Exception as exc:
                logger.warning(f"personal_rag_search 失败: {exc}")
                return [{"title": "检索失败", "snippet": "内部错误", "url": ""}]

    @tool
    async def web_search(
        query: Annotated[str, "搜索关键词"],
        top_k: Annotated[int, "返回结果数量"] = 5,
    ) -> list[dict]:
        """联网搜索，获取最新信息。

        Args:
            query: 搜索关键词。
            top_k: 返回结果数量上限。
        """
        logger.debug(f"[tool] web_search  query={query}")
        async with session_factory() as session:
            api_key = ""
            if model_config:
                api_key = (((model_config or {}).get("search_config") or {}).get("api_key") or "")
            if not api_key:
                return [{"error": "未配置 search_config.api_key", "query": query}]
            service = WebSearchService(session)
            return await service.search(query=query, api_key=api_key, top_k=top_k, use_cache=True)

    @tool
    async def list_user_books(
        user_id: Annotated[int, InjectedState("user_id")] = 0,
    ) -> list[dict]:
        """列出当前用户的所有书籍。

        Returns:
            书籍列表，每项包含 id、title、genre、字数统计等信息。
        """
        logger.debug(f"[tool] list_user_books  user_id={user_id}")
        async with session_factory() as session:
            stmt = select(Book).where(Book.user_id == user_id).order_by(Book.id)
            result = await session.execute(stmt)
            books = result.scalars().all()
            return [
                {
                    "id": b.id, "title": b.title, "genre": b.genre,
                    "description": b.description, "pinned": b.pinned,
                    "total_word_goal": b.total_word_goal, "current_word_count": b.current_word_count,
                }
                for b in books
            ]

    @tool
    async def get_book_context(
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """获取当前书籍的完整上下文，包括基本信息、角色列表和卷宗结构。

        Returns:
            包含 book、characters、volumes 及数量统计的字典。
        """
        logger.debug(f"[tool] get_book_context  user_id={user_id}  book_id={book_id}")
        async with session_factory() as session:
            from models.book import Book as BookModel, Character, Volume as VolumeModel
            from sqlalchemy import select as sa_select
            book_stmt = sa_select(BookModel).where(BookModel.id == book_id, BookModel.user_id == user_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"error": "书籍不存在或无权访问"}
            char_stmt = sa_select(Character).where(Character.book_id == book_id).order_by(Character.id)
            char_result = await session.execute(char_stmt)
            characters = char_result.scalars().all()
            vol_stmt = sa_select(VolumeModel).where(VolumeModel.book_id == book_id).order_by(VolumeModel.sort_order, VolumeModel.id)
            vol_result = await session.execute(vol_stmt)
            volumes = vol_result.scalars().all()
            return {
                "book": {
                    "id": book.id, "title": book.title,
                    "description": book.description, "genre": book.genre,
                    "total_word_goal": book.total_word_goal, "current_word_count": book.current_word_count,
                },
                "character_count": len(characters),
                "characters": [
                    {"id": c.id, "name": c.name, "role_type": c.role_type, "description": c.description}
                    for c in characters
                ],
                "volume_count": len(volumes),
                "volumes": [
                    {"id": v.id, "title": v.title, "summary": v.summary}
                    for v in volumes
                ],
            }

    @tool
    async def extract_characters(
        content: Annotated[str, "需要提取人物的文本内容"],
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """从文本中自动提取人物实体，用于辅助构建角色设定。

        仅提取人物，不提取地点或事件。每项包含 name、description、role_type。

        Args:
            content: 需要分析的文本内容（如章节正文、设定描述等）。
        """
        logger.debug(f"[tool] extract_characters  book_id={book_id}  content_len={len(content)}")
        if not content.strip():
            return {"book_id": book_id, "characters": [], "message": "内容为空，无需提取"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"extract_characters 初始化模型失败: {exc}")
        if llm is None:
            return {"book_id": book_id, "characters": [], "message": "模型未配置，跳过提取"}
        from langchain_core.messages import SystemMessage
        from langchain_core.output_parsers import JsonOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""你是人物提取助手。从给定文本中提取所有人物实体。

输出 JSON 格式：{"characters": [{"name": "姓名", "description": "外貌/性格/背景描述", "role_type": "主角/配角/反派/路人"}]}

规则：
- 只提取有明确姓名或身份的人物，忽略泛指的群体（如"众人""士兵们"）
- description 要包含该人物在文本中体现的外貌、性格、背景等关键信息
- role_type 根据文本中的重要性判断，可留空
- 只输出 JSON，不要其他内容。"""),
            ("human", "{content}"),
        ])
        try:
            chain = prompt | llm.main | JsonOutputParser()
            result = await chain.ainvoke({"content": content[:4000]})
        except Exception as exc:
            logger.warning(f"extract_characters 提取失败: {exc}")
            return {"book_id": book_id, "characters": [], "message": f"提取失败: {exc}"}
        characters = result.get("characters", []) if isinstance(result, dict) else []
        return {"book_id": book_id, "characters": characters}

    @tool
    async def extract_locations(
        content: Annotated[str, "需要提取地点的文本内容"],
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """从文本中自动提取地点实体，用于辅助构建世界观场景。

        仅提取地点，不提取人物或事件。每项包含 name、type、description。

        Args:
            content: 需要分析的文本内容（如章节正文、设定描述等）。
        """
        logger.debug(f"[tool] extract_locations  book_id={book_id}  content_len={len(content)}")
        if not content.strip():
            return {"book_id": book_id, "locations": [], "message": "内容为空，无需提取"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"extract_locations 初始化模型失败: {exc}")
        if llm is None:
            return {"book_id": book_id, "locations": [], "message": "模型未配置，跳过提取"}
        from langchain_core.messages import SystemMessage
        from langchain_core.output_parsers import JsonOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""你是地点提取助手。从给定文本中提取所有地点/场景实体。

输出 JSON 格式：{"locations": [{"name": "地点名", "type": "城市/建筑/自然/室内/场所", "description": "环境特征和氛围描述"}]}

规则：
- 提取所有有具体名称或明确描述的场景地点
- type 根据地点特征分类：城市、建筑、自然景观、室内空间、场所等
- description 要包含该地点在文中体现的环境特征、氛围、功能等信息
- 只输出 JSON，不要其他内容。"""),
            ("human", "{content}"),
        ])
        try:
            chain = prompt | llm.main | JsonOutputParser()
            result = await chain.ainvoke({"content": content[:4000]})
        except Exception as exc:
            logger.warning(f"extract_locations 提取失败: {exc}")
            return {"book_id": book_id, "locations": [], "message": f"提取失败: {exc}"}
        locations = result.get("locations", []) if isinstance(result, dict) else []
        return {"book_id": book_id, "locations": locations}

    @tool
    async def extract_events(
        content: Annotated[str, "需要提取事件的文本内容"],
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """从文本中自动提取事件/情节节点，用于辅助构建时间线。

        仅提取事件，不提取人物或地点。每项包含 name、description、event_type。

        Args:
            content: 需要分析的文本内容（如章节正文、设定描述等）。
        """
        logger.debug(f"[tool] extract_events  book_id={book_id}  content_len={len(content)}")
        if not content.strip():
            return {"book_id": book_id, "events": [], "message": "内容为空，无需提取"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"extract_events 初始化模型失败: {exc}")
        if llm is None:
            return {"book_id": book_id, "events": [], "message": "模型未配置，跳过提取"}
        from langchain_core.messages import SystemMessage
        from langchain_core.output_parsers import JsonOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""你是事件提取助手。从给定文本中提取所有关键情节事件。

输出 JSON 格式：{"events": [{"name": "事件名", "description": "事件简述", "event_type": "冲突/转折/揭示/过渡/日常"}]}

规则：
- 提取文本中的关键情节节点，如冲突爆发、信息揭示、关系变化、场景转换等
- event_type 分类：冲突（对立/斗争）、转折（情节方向改变）、揭示（信息公开/发现）、过渡（场景切换/时间推移）、日常（人物日常互动）
- description 简明扼要，一句话概括事件核心
- 只输出 JSON，不要其他内容。"""),
            ("human", "{content}"),
        ])
        try:
            chain = prompt | llm.main | JsonOutputParser()
            result = await chain.ainvoke({"content": content[:4000]})
        except Exception as exc:
            logger.warning(f"extract_events 提取失败: {exc}")
            return {"book_id": book_id, "events": [], "message": f"提取失败: {exc}"}
        events = result.get("events", []) if isinstance(result, dict) else []
        return {"book_id": book_id, "events": events}

    @tool
    async def create_character(
        name: Annotated[str, "角色名称"],
        description: Annotated[str, "角色描述"],
        role_type: Annotated[str | None, "角色类型：主角/配角/反派/路人等"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """创建一个新角色，用于构建书籍的人物设定。

        Args:
            name: 角色名称，必填。
            description: 角色描述，可包含外貌、性格、背景等信息。
            role_type: 角色类型，如主角、配角、反派、路人等。
        """
        logger.debug(f"[tool] create_character  book_id={book_id}  name={name}")
        async with session_factory() as session:
            try:
                from models.book import Character
                instance = Character(
                    user_id=user_id,
                    book_id=book_id,
                    name=name,
                    description=description,
                    role_type=role_type,
                )
                session.add(instance)
                await session.commit()
                return {"id": instance.id, "name": instance.name, "message": "角色创建成功"}
            except Exception as exc:
                await session.rollback()
                logger.warning(f"create_character 失败: {exc}")
                return {"message": f"创建失败: {exc}"}

    @tool
    async def create_location(
        name: Annotated[str, "地点名称"],
        type: Annotated[str, "地点类型：城市/建筑/自然/室内/场所等"],
        description: Annotated[str, "地点描述"],
        parent_id: Annotated[int | None, "父地点ID，用于建立地点层级关系"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """创建一个新地点/场景，用于构建世界观地理设定。

        Args:
            name: 地点名称，必填。
            type: 地点类型，如城市、建筑、自然景观、室内空间、场所等。
            description: 地点描述，包含环境特征、氛围、功能等信息。
            parent_id: 父地点ID，如果该地点属于某个更大的地点（如"大殿"属于"皇宫"）。
        """
        logger.debug(f"[tool] create_location  book_id={book_id}  name={name}")
        async with session_factory() as session:
            repo = WorldRepository(session)
            try:
                data = {"name": name, "type": type, "description": description}
                if parent_id is not None:
                    data["parent_id"] = parent_id
                instance = await repo.create_location(book_id, data)
                return {"id": instance.id, "name": instance.name, "message": "地点创建成功"}
            except Exception as exc:
                logger.warning(f"create_location 失败: {exc}")
                return {"message": f"创建失败: {exc}"}

    @tool
    async def create_scene_event(
        name: Annotated[str, "事件名称"],
        description: Annotated[str, "事件描述"],
        event_type: Annotated[str | None, "事件类型：冲突/转折/揭示/过渡/日常等"] = None,
        chapter_id: Annotated[int | None, "关联的章节ID"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """创建一个时间线事件，用于记录故事中的关键情节节点。

        Args:
            name: 事件名称，必填。
            description: 事件描述，简明扼要地说明事件内容。
            event_type: 事件类型，如冲突、转折、揭示、过渡、日常等。
            chapter_id: 关联的章节ID，表示事件发生在该章节中。
        """
        logger.debug(f"[tool] create_scene_event  book_id={book_id}  name={name}")
        async with session_factory() as session:
            repo = WorldRepository(session)
            try:
                data = {"name": name, "description": description}
                if event_type is not None:
                    data["event_type"] = event_type
                if chapter_id is not None:
                    data["chapter_id"] = chapter_id
                instance = await repo.create_scene_event(book_id, data)
                return {"id": instance.id, "name": instance.name, "message": "时间线事件创建成功"}
            except Exception as exc:
                logger.warning(f"create_scene_event 失败: {exc}")
                return {"message": f"创建失败: {exc}"}

    @tool
    async def update_foreshadowing(
        item_id: Annotated[int, "伏笔ID"],
        data: Annotated[dict, "要更新的字段，支持 description/status/resolved_at_chapter_id/notes"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """更新伏笔信息。

        Args:
            item_id: 伏笔ID。
            data: 要更新的字段字典，可包含 description、status、resolved_at_chapter_id、notes 等。
        """
        logger.debug(f"[tool] update_foreshadowing  book_id={book_id}  item_id={item_id}")
        async with session_factory() as session:
            instance = await WorldRepository(session).update_foreshadowing(item_id, book_id, data)
            if not instance:
                return {"error": "伏笔不存在", "item_id": item_id}
            return {"id": instance.id, "description": instance.description, "status": instance.status, "resolved_at_chapter_id": instance.resolved_at_chapter_id}

    @tool
    async def update_plot_thread(
        item_id: Annotated[int, "剧情线索ID"],
        data: Annotated[dict, "要更新的字段，支持 name/description/status/progress_note"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """更新剧情线索信息。

        Args:
            item_id: 剧情线索ID。
            data: 要更新的字段字典，可包含 name、description、status、progress_note 等。
        """
        logger.debug(f"[tool] update_plot_thread  book_id={book_id}  item_id={item_id}")
        async with session_factory() as session:
            instance = await WorldRepository(session).update_plot_thread(item_id, book_id, data)
            if not instance:
                return {"error": "情节脉络不存在", "item_id": item_id}
            return {"id": instance.id, "name": instance.name, "status": instance.status, "progress_note": instance.progress_note}

    @tool
    async def update_timeline(
        item_id: Annotated[int, "时间线事件ID"],
        data: Annotated[dict, "要更新的字段，支持 name/description/event_type"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """更新时间线事件信息。

        Args:
            item_id: 时间线事件ID。
            data: 要更新的字段字典，可包含 name、description、event_type 等。
        """
        logger.debug(f"[tool] update_timeline  book_id={book_id}  item_id={item_id}")
        async with session_factory() as session:
            instance = await WorldRepository(session).update_scene_event(item_id, book_id, data)
            if not instance:
                return {"error": "时间线事件不存在", "item_id": item_id}
            return {"id": instance.id, "name": instance.name, "description": instance.description, "event_type": instance.event_type}

    @tool
    async def polish_text(
        text: Annotated[str, "需要润色的文本"],
        instruction: Annotated[str, "润色要求，如'更简洁'、'更有文采'、'调整节奏'"] = "",
    ) -> dict:
        """润色文本，改进表达、节奏和可读性，保持原意不变。

        Args:
            text: 需要润色的原始文本。
            instruction: 润色要求，用自然语言描述期望的效果。
        """
        logger.debug(f"[tool] polish_text  text_len={len(text)}  instruction={instruction}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
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
    async def rewrite_paragraph(
        text: Annotated[str, "需要改写的文本"],
        instruction: Annotated[str, "改写要求，如'换个角度'、'更口语化'、'增加紧张感'"] = "",
    ) -> dict:
        """改写文本段落，保持核心含义但改变表达方式。

        Args:
            text: 需要改写的原始文本。
            instruction: 改写要求，用自然语言描述期望的方向。
        """
        logger.debug(f"[tool] rewrite_paragraph  text_len={len(text)}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
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
    async def expand_text(
        text: Annotated[str, "需要扩写的文本"],
        target_length: Annotated[int | None, "目标字数，默认为原文的三倍"] = None,
    ) -> dict:
        """扩写文本，丰富细节、描写和对话，使内容更加生动。

        Args:
            text: 需要扩写的原始文本。
            target_length: 目标字数，不指定则自动设为原文三倍。
        """
        logger.debug(f"[tool] expand_text  text_len={len(text)}  target={target_length}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
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
    async def summarize_selected(
        text: Annotated[str, "需要总结的文本"],
        max_length: Annotated[int | None, "摘要最大字数，默认200字"] = None,
    ) -> dict:
        """总结文本内容，保留关键信息和核心情节。

        Args:
            text: 需要总结的原始文本。
            max_length: 摘要的最大字数，不指定则默认200字。
        """
        logger.debug(f"[tool] summarize_selected  text_len={len(text)}  max={max_length}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
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
    async def suggest_alternatives(
        text: Annotated[str, "需要生成改写建议的文本"],
        position: Annotated[int | None, "指定文本中某个位置，对该位置附近生成建议"] = None,
        count: Annotated[int, "生成的建议数量"] = 3,
    ) -> dict:
        """为给定文本生成多种改写建议。

        Args:
            text: 原始文本。
            position: 文本中的字符位置（可选），聚焦该位置的改写建议。
            count: 生成建议的数量。
        """
        logger.debug(f"[tool] suggest_alternatives  text_len={len(text)}  count={count}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
        system = SystemMessage(content="你是写作建议助手。针对给定文本，提供多个不同风格的改写建议。")
        pos_hint = f"请针对文本中第{position}个字符附近的位置，" if position is not None else "请"
        human = HumanMessage(content=f"{pos_hint}提供 {count} 种不同风格的改写建议：\n{text[:4000]}")
        try:
            result = await llm.main.ainvoke([system, human])
            alternatives = result.content if hasattr(result, "content") else str(result)
            return {"alternatives": alternatives, "count": count}
        except Exception as exc:
            logger.error(f"suggest_alternatives 失败: {exc}", exc_info=True)
            return {"error": f"生成建议失败: {exc}"}

    @tool
    async def check_consistency(
        chapter_id: Annotated[int | None, "要检查的章节ID，为空则检查当前活跃章节"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """检查章节正文与设定的一致性（人物、地点、时间线）。

        Args:
            chapter_id: 要检查的章节ID，不指定则检查最新章节。
        """
        logger.debug(f"[tool] check_consistency  book_id={book_id}  chapter_id={chapter_id}")
        async with session_factory() as session:
            from models.book import ChapterContent
            book_stmt = select(Book).where(Book.id == book_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"error": "书籍不存在"}
            characters = await CharacterRepository(session).book_character_detail(user_id=book.user_id, book_id=book_id)
            locations = await WorldRepository(session).list_locations(book_id)
            scene_events = await WorldRepository(session).list_scene_events(book_id)
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
            from langchain_core.messages import HumanMessage, SystemMessage
            system = SystemMessage(content="你是 consistency 检查助手。检查正文中的人物、地点、时间线是否与设定一致。列出不一致的地方。")
            human = HumanMessage(content=f"书籍：{book.title}\n人物：{[c.name for c in characters]}\n地点：{[loc.name for loc in locations]}\n时间线：{[ev.name for ev in scene_events]}\n\n请检查以下正文中的一致性：\n{content[:4000]}")
            try:
                result = await llm.main.ainvoke([system, human])
                issues = result.content if hasattr(result, "content") else str(result)
                return {"chapter_id": chapter_id, "issues": issues, "checked_length": len(content)}
            except Exception as exc:
                logger.error(f"check_consistency 失败: {exc}", exc_info=True)
                return {"error": f"检查失败: {exc}"}

    @tool
    async def check_grammar(
        text: Annotated[str, "需要检查的文本"],
    ) -> dict:
        """检查文本的语法、拼写和标点错误，列出问题和修正建议。

        Args:
            text: 需要检查的文本内容。
        """
        logger.debug(f"[tool] check_grammar  text_len={len(text)}")
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
        from langchain_core.messages import HumanMessage, SystemMessage
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
    async def search_across_books(
        query: Annotated[str, "搜索关键词"],
        top_k: Annotated[int, "返回结果数量"] = 5,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
    ) -> list[dict]:
        """跨书籍搜索用户所有文档，使用语义检索。

        Args:
            query: 搜索关键词。
            top_k: 返回结果数量上限。
        """
        logger.debug(f"[tool] search_across_books  user_id={user_id}  query={query}")
        async with session_factory() as session:
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
                from models.document import Document
                from sqlalchemy import select as sa_select
                doc_stmt = sa_select(Document.id, Document.file_name).where(Document.user_id == user_id)
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
                return [{"error": "搜索异常", "query": query}]

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
        extract_characters,
        extract_locations,
        extract_events,
        create_character,
        create_location,
        create_scene_event,
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


def build_tool_node(session_factory, model_config: dict | None = None):
    from langgraph.prebuilt import ToolNode

    from .tools.feedback_tools import _build_feedback_tools
    from .tools.generate_chapter_tool import build_generate_chapter_tool
    from .tools.workflow_tools import build_workflow_tool
    from .tools.extend_outline_tool import build_extend_outline_tool

    tools = _build_agent_tools(session_factory, model_config=model_config)
    tools.append(build_generate_chapter_tool(session_factory, model_config=model_config))
    tools.extend(build_workflow_tool(session_factory, model_config=model_config))
    tools.append(build_extend_outline_tool(session_factory, model_config=model_config))
    tools.extend(_build_feedback_tools(session_factory, model_config=model_config).values())
    logger.debug(f"[tool_node] 注册了 {len(tools)} 个工具")
    return ToolNode(tools)
