from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger

logger = get_logger(__name__)

ENTITY_TABLE_MAP = {
    "characters": "models.book.Character",
    "locations": "models.book.Location",
    "foreshadowings": "models.book.Foreshadowing",
    "plot_threads": "models.book.PlotThread",
    "scene_events": "models.book.SceneEvent",
    "creative_settings": "models.book.CreativeSetting",
}


async def is_locked(session: AsyncSession, entity_type: str, entity_id: int) -> bool:
    """检查指定实体是否被锁定。"""
    model_path = ENTITY_TABLE_MAP.get(entity_type)
    if not model_path:
        return False
    module_path, class_name = model_path.rsplit(".", 1)
    try:
        module = __import__(module_path, fromlist=[class_name])
        model_cls = getattr(module, class_name)
    except (ImportError, AttributeError):
        return False
    stmt = select(model_cls.locked).where(model_cls.id == entity_id)
    result = await session.execute(stmt)
    locked_val = result.scalar_one_or_none()
    return bool(locked_val)


async def enforce_unlocked(
    session: AsyncSession, entity_type: str, entity_id: int
) -> dict[str, Any] | None:
    """若实体被锁定则返回错误描述，否则返回 None。"""
    if await is_locked(session, entity_type, entity_id):
        return {
            "error": "locked",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "message": f"{entity_type} #{entity_id} 已被锁定，禁止修改",
        }
    return None


async def set_lock(session: AsyncSession, entity_type: str, entity_id: int, locked: bool) -> bool:
    """设置实体锁定状态。"""
    model_path = ENTITY_TABLE_MAP.get(entity_type)
    if not model_path:
        return False
    module_path, class_name = model_path.rsplit(".", 1)
    try:
        module = __import__(module_path, fromlist=[class_name])
        model_cls = getattr(module, class_name)
    except (ImportError, AttributeError):
        return False
    stmt = select(model_cls).where(model_cls.id == entity_id)
    result = await session.execute(stmt)
    instance = result.scalar_one_or_none()
    if not instance:
        return False
    instance.locked = locked
    await session.commit()
    return True


async def validate_ownership(session: AsyncSession, entity_type: str, entity_id: int, user_id: int) -> bool:
    """验证用户是否拥有指定实体（通过所属书籍的用户 ID）。"""
    model_path = ENTITY_TABLE_MAP.get(entity_type)
    if not model_path:
        return False
    module_path, class_name = model_path.rsplit(".", 1)
    try:
        module = __import__(module_path, fromlist=[class_name])
        model_cls = getattr(module, class_name)
    except (ImportError, AttributeError):
        return False

    book_id_field = "book_id"

    stmt = select(model_cls).where(model_cls.id == entity_id)
    result = await session.execute(stmt)
    instance = result.scalar_one_or_none()
    if not instance:
        return False

    book_id = getattr(instance, book_id_field, None)
    if not book_id:
        return False

    from sqlalchemy import select as sa_select

    from models.book import Book
    book_stmt = sa_select(Book).where(Book.id == book_id, Book.user_id == user_id)
    book_result = await session.execute(book_stmt)
    return book_result.scalar_one_or_none() is not None
