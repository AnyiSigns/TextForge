from typing import Annotated

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from models.book import Book, ChapterContent
from sqlalchemy import select

from domains.book.repository import CharacterRepository
from domains.knowledge.repository import VectorRepository
from domains.world.repository import WorldRepository

from ..web_search_service import WebSearchService

logger = get_logger(__name__)

TEXT_MODE_PROMPTS = {
    "polish": "你是专业的文字润色助手。改进文本的表达、节奏和可读性，保持原意不变。直接输出润色后的文本。",
    "rewrite": "你是专业的改写助手。根据用户指令改写文本，保持核心含义但改变表达方式。直接输出改写后的文本。",
    "expand": "你是专业的扩写助手。在保持原意和风格的基础上，丰富细节、描写和对话，使文本更加生动。直接输出扩写后的文本。",
    "summarize": "你是专业的摘要助手。请简洁地总结文本内容，保留关键信息和核心情节。",
    "alternatives": "你是写作建议助手。针对给定文本，提供多个不同风格的改写建议。",
}


def _build_world_tools(session_factory, model_config: dict | None = None):
    @tool
    async def transform_text(
        text: Annotated[str, "需要加工的文本"],
        mode: Annotated[str, "加工模式：polish(润色)/rewrite(改写)/expand(扩写)/summarize(摘要)/alternatives(替代表达)"] = "polish",
        instruction: Annotated[str, "润色/改写的具体要求（polish/rewrite 使用）"] = "",
        target_length: Annotated[int | None, "扩写目标字数（expand 使用）"] = None,
        max_length: Annotated[int | None, "摘要最大字数（summarize 使用）"] = None,
        count: Annotated[int, "建议条数（alternatives 使用）"] = 3,
    ) -> dict:
        """对文本进行统一加工：润色、改写、扩写、摘要或生成替代表达。纯函数，不落库。"""
        logger.debug(f"[tool] transform_text  mode={mode}  text_len={len(text)}")
        if not text.strip():
            return {"error": "文本为空"}
        mode = mode or "polish"
        if mode not in TEXT_MODE_PROMPTS:
            return {"error": f"不支持的 mode: {mode}"}
        if mode == "polish":
            human = f"请润色以下文本：\n{text}\n润色要求：{instruction or '优化表达'}"
        elif mode == "rewrite":
            human = f"请改写以下文本：\n{text}\n改写要求：{instruction or '换个角度重写'}"
        elif mode == "expand":
            human = f"请扩写以下文本，目标字数约 {target_length or len(text) * 3} 字：\n{text}"
        elif mode == "summarize":
            human = f"请将以下文本总结为 {max_length or 200} 字以内的摘要：\n{text}"
        else:
            human = f"请提供 {count} 种不同风格的改写建议：\n{text}"
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"transform_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法加工文本"}
        system = SystemMessage(content=TEXT_MODE_PROMPTS[mode])
        human_msg = HumanMessage(content=human[:6000])
        try:
            result = await llm.main.ainvoke([system, human_msg])
            out = result.content if hasattr(result, "content") else str(result)
        except Exception as exc:
            logger.error(f"transform_text 失败: {exc}", exc_info=True)
            from shared.utils import redact_sensitive

            return {"error": f"加工失败: {redact_sensitive(str(exc))}"}
        key_map = {
            "polish": "polished_text", "rewrite": "rewritten_text",
            "expand": "expanded_text", "summarize": "summary", "alternatives": "alternatives",
        }
        return {"mode": mode, "original_length": len(text), "result_length": len(out), key_map[mode]: out}

    @tool
    async def review_text(
        mode: Annotated[str, "检查模式：grammar(语法)/consistency(一致性)"] = "grammar",
        text: Annotated[str | None, "直接提供待检查文本（grammar 必填）"] = None,
        chapter_id: Annotated[int | None, "一致性检查的目标章节ID，为空则检查当前活跃章节最新内容"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """检查文本：grammar 检查语法错误，consistency 检查正文与设定（人物/地点/时间线）的一致性。"""
        logger.debug(f"[tool] review_text  mode={mode}  book_id={book_id}  chapter_id={chapter_id}")
        if mode not in ("grammar", "consistency"):
            return {"error": f"不支持的 mode: {mode}"}
        content = text or ""
        characters = locations = scene_events = None
        if mode == "consistency":
            async with session_factory() as session:
                book_stmt = select(Book).where(Book.id == book_id)
                book = (await session.execute(book_stmt)).scalar_one_or_none()
                if not book:
                    return {"error": "书籍不存在"}
                characters = await CharacterRepository(session).book_character_detail(user_id=book.user_id, book_id=book_id)
                locations = await WorldRepository(session).list_locations(book_id)
                scene_events = await WorldRepository(session).list_scene_events(book_id)
                if chapter_id:
                    cc_stmt = select(ChapterContent).where(ChapterContent.chapter_id == chapter_id).order_by(ChapterContent.version.desc()).limit(1)
                    cc = (await session.execute(cc_stmt)).scalar_one_or_none()
                    content = cc.content or "" if cc else ""
                if not content:
                    return {"error": "无正文内容可检查"}
        if not content.strip():
            return {"error": "文本为空"}
        llm = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
            except Exception as exc:
                logger.warning(f"review_text 初始化模型失败: {exc}")
        if llm is None:
            return {"error": "模型未配置，无法检查"}
        if mode == "grammar":
            system = SystemMessage(content="你是语法检查助手。检查文本中的语法、拼写和标点错误，列出问题并给出修正建议。")
            human = f"请检查以下文本的语法错误：\n{content[:4000]}"
        else:
            system = SystemMessage(content="你是 consistency 检查助手。检查正文中的人物、地点、时间线是否与设定一致。列出不一致的地方。")
            human = (
                f"书籍：{book.title}\n"
                f"人物：{[c.name for c in characters]}\n"
                f"地点：{[loc.name for loc in locations]}\n"
                f"时间线：{[ev.title for ev in scene_events]}\n\n"
                f"请检查以下正文中的一致性：\n{content[:4000]}"
            )
        try:
            result = await llm.main.ainvoke([system, HumanMessage(content=human)])
            issues = result.content if hasattr(result, "content") else str(result)
        except Exception as exc:
            logger.error(f"review_text 失败: {exc}", exc_info=True)
            from shared.utils import redact_sensitive

            return {"error": f"检查失败: {redact_sensitive(str(exc))}"}
        return {"mode": mode, "checked_length": len(content), "issues": issues}

    @tool
    async def search(
        query: Annotated[str, "搜索关键词"],
        mode: Annotated[str, "检索模式：docs(公开文档语义RAG)/web(联网搜索)"] = "docs",
        top_k: Annotated[int, "返回结果数量"] = 5,
        doc_ids: Annotated[list | None, "限定文档ID列表（mode=docs 时），对应 documents.id"] = None,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> list[dict]:
        """统一检索入口：mode=docs 语义检索公开文档库（全库公开文档，文档无书籍归属概念），mode=web 联网搜索。"""
        logger.debug(f"[tool] search  mode={mode}  query={query}  book_id={book_id}")
        if mode == "web":
            async with session_factory() as session:
                api_key = (((model_config or {}).get("search_config") or {}).get("api_key") or "")
                if not api_key:
                    return [{"error": "未配置 search_config.api_key", "query": query}]
                service = WebSearchService(session)
                return await service.search(query=query, api_key=api_key, top_k=top_k, use_cache=True)
        async with session_factory() as session:
            vector_repo = VectorRepository(session)
            embedding = None
            if model_config:
                try:
                    llm = ModelFactory(model_config)
                    embedding = await llm.embedding.aembed_query(query)
                except Exception as exc:
                    logger.warning(f"search embedding 失败: {exc}")
            if embedding is None:
                return []
            rag_filter = {"query": query}
            if doc_ids:
                rag_filter["doc_ids"] = [str(d) for d in doc_ids]
            # 注意：文档库为全局公开库（Document 无 book_id 列，检索范围不受当前书籍影响），
            # 如需限定范围请使用 doc_ids。
            items = await vector_repo.search_external_books(query_embedding=embedding, rag_filter=rag_filter, top_k=top_k)
            return [
                {
                    "source": "docs",
                    "doc_id": item.get("doc_id"),
                    "doc_title": item.get("doc_title"),
                    "doc_author": item.get("doc_author"),
                    "content": item.get("content"),
                    # 相关度权威来源已下沉到 search_external_books（score=1-distance）；
                    # distance 兜底兼容旧版 Redis 缓存中未含 score 的条目。
                    "score": item.get(
                        "score", 1 - float(item.get("distance", 0) or 0)
                    ),
                }
                for item in items
            ]

    return [transform_text, review_text, search]
