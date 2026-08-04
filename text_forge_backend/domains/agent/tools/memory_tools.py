
from typing import Annotated

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from shared.database import db_manager

from domains.memory.service import AgentMemoryService

logger = get_logger(__name__)


@tool
async def save_memory(
    content: Annotated[str, "记忆内容"],
    memory_type: Annotated[str, "记忆类型：preference/character/plot/world"] = "preference",
    priority: Annotated[int, "优先级，5为默认"] = 5,
    source: Annotated[str, "来源标识"] = "agent_self_reflection",
    related_character_ids: Annotated[list | None, "关联角色ID列表"] = None,
    related_chapter_id: Annotated[int | None, "关联章节ID"] = None,
    meta: Annotated[dict | None, "附加元数据"] = None,
    user_id: Annotated[int, InjectedState("user_id")] = 0,
    book_id: Annotated[int, InjectedState("active_book_id")] = 0,
) -> dict:
    """保存一条记忆，用于 Agent 长期记忆管理。

    Args:
        content: 要保存的记忆内容文本。
        memory_type: 记忆分类，可选 preference（偏好）、character（角色）、plot（情节）、world（世界观）。
        priority: 优先级（1-10），数字越大越重要，默认为5。
        source: 来源标识，如 agent_self_reflection、user_feedback 等。
        related_character_ids: 关联的角色ID列表。
        related_chapter_id: 关联的章节ID。
        meta: 额外的元数据字典。
    """
    logger.debug(f"[tool] save_memory  user_id={user_id}  book_id={book_id}  type={memory_type}  len={len(content)}")
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        effective_book_id = book_id if book_id else None
        memory = await service.save_memory(
            user_id=user_id,
            book_id=effective_book_id,
            memory_type=memory_type,
            content=content,
            related_chapter_id=related_chapter_id,
            related_character_ids=related_character_ids,
            priority=priority,
            source=source,
            meta=meta,
        )
        return {"memory_id": memory.id}


@tool
async def recall_memory(
    query: Annotated[str, "搜索查询文本"],
    memory_type: Annotated[str | None, "按类型筛选，为空则搜索全部"] = None,
    top_k: Annotated[int, "返回结果数量"] = 5,
    model_config_data: Annotated[dict | None, "模型配置，用于语义搜索"] = None,
    user_id: Annotated[int, InjectedState("user_id")] = 0,
    book_id: Annotated[int, InjectedState("active_book_id")] = 0,
) -> list[dict]:
    """搜索 Agent 记忆，先尝试语义搜索，失败则回退到全文搜索。

    Args:
        query: 搜索查询文本，描述你想找的内容。
        memory_type: 按类型筛选（preference/character/plot/world），为空则搜索全部。
        top_k: 返回结果的最大数量。
        model_config_data: 用于语义嵌入的模型配置，通常由系统自动提供。
    """
    logger.debug(f"[tool] recall_memory  user_id={user_id}  book_id={book_id}  query={query}")
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        effective_book_id = book_id if book_id else None
        results = await service.search_memories(
            user_id=user_id,
            mode="semantic",
            query=query,
            book_id=effective_book_id,
            memory_type=memory_type,
            top_k=top_k,
            model_config=model_config_data,
        )
        if not results:
            results = await service.search_memories(
                user_id=user_id,
                mode="fulltext",
                query=query,
                book_id=effective_book_id,
                memory_type=memory_type,
                top_k=top_k,
                model_config=None,
            )
        return results


@tool
async def list_memories_by_type(
    memory_type: Annotated[str, "要列出的记忆类型"],
    user_id: Annotated[int, InjectedState("user_id")] = 0,
    book_id: Annotated[int, InjectedState("active_book_id")] = 0,
) -> list[dict]:
    """按类型列出记忆。

    Args:
        memory_type: 记忆类型，可选 preference/character/plot/world。
    """
    logger.debug(f"[tool] list_memories_by_type  user_id={user_id}  book_id={book_id}  type={memory_type}")
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        effective_book_id = book_id if book_id else None
        return await service.list_memories(user_id=user_id, book_id=effective_book_id, memory_type=memory_type)


@tool
async def forget_memory(
    memory_id: Annotated[int, "要删除的记忆ID"],
    user_id: Annotated[int, InjectedState("user_id")] = 0,
) -> dict:
    """删除指定ID的记忆条目。

    Args:
        memory_id: 要删除的记忆ID。
    """
    logger.debug(f"[tool] forget_memory  user_id={user_id}  memory_id={memory_id}")
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        memory = await service.get_memory(user_id=user_id, memory_id=memory_id)
        if not memory:
            return {"ok": False, "detail": "记忆不存在"}
        await service.delete_memory(user_id=user_id, memory_id=memory_id)
        return {"ok": True}


@tool
async def update_memory(
    memory_id: Annotated[int, "要更新的记忆ID"],
    content: Annotated[str | None, "新的记忆内容"] = None,
    memory_type: Annotated[str | None, "新的记忆类型"] = None,
    priority: Annotated[int | None, "新的优先级"] = None,
    meta: Annotated[dict | None, "新的元数据"] = None,
    user_id: Annotated[int, InjectedState("user_id")] = 0,
) -> dict:
    """更新指定记忆条目的内容或属性。

    Args:
        memory_id: 要更新的记忆ID。
        content: 新的记忆内容（可选）。
        memory_type: 新的记忆类型（可选）。
        priority: 新的优先级（可选）。
        meta: 新的元数据（可选）。
    """
    logger.debug(f"[tool] update_memory  user_id={user_id}  memory_id={memory_id}")
    async with db_manager.with_db() as session:
        service = AgentMemoryService(session)
        payload = {k: v for k, v in {"memory_type": memory_type, "content": content, "priority": priority, "meta": meta}.items() if v is not None}
        memory = await service.update_memory(user_id=user_id, memory_id=memory_id, data=payload)
        if not memory:
            return {"ok": False, "detail": "记忆不存在"}
        return {"ok": True, "memory": memory}
