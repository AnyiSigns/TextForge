from typing import Annotated

from config.logging import get_logger
from fastapi import Depends
from models.book import Book
from shared.database import db_manager
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import (
    BookRepository,
    CharacterRepository,
    CreativeSettingRepository,
)

logger = get_logger(__name__)


class BookService:
    """书籍相关业务逻辑服务。

    提供书籍 CRUD、角色列表、创意设定等核心功能。
    """

    def __init__(self, session: AsyncSession):
        """初始化 BookService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        self.book_repo = BookRepository(session)
        self.character_repo = CharacterRepository(session)
        self.creative_setting_repo = CreativeSettingRepository(session)

    async def query_user_books(self, user_id: int, **kwargs):
        """查询用户书籍列表。

        Args:
            user_id: 用户 ID。
            **kwargs: 可选过滤条件，当前支持 genre。

        Returns:
            书籍列表，查询失败返回空列表。
        """
        try:
            result = await self.book_repo.by_user_parameter_book(user_id, **kwargs)
            return result or []
        except Exception:
            logger.error("查询错误", exc_info=True)
            raise AppException(status_code=500, detail="查询书籍列表失败", error_code="LIST_BOOKS_FAILED")

    async def create_book(self, **kwargs):
        """创建新书籍。

        会检查当前用户下是否存在同名书籍，存在则抛出 ValueError。

        Args:
            **kwargs: 书籍字段，需包含 user_id 与 title。

        Returns:
            新创建的 Book 实例，失败返回 None。
        """
        try:
            user_id = kwargs.get("user_id")
            title = kwargs.get("title")
            if title and user_id:
                stmt = select(Book).where(Book.user_id == user_id, Book.title == title)
                result = await self.session.execute(stmt)
                if result.scalar_one_or_none():
                    raise ValueError("书名已存在")
            instance = await self.book_repo.add(**kwargs)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except ValueError:
            raise
        except Exception:
            logger.error("创建新书籍失败", exc_info=True)
            raise AppException(status_code=500, detail="创建新书籍失败", error_code="CREATE_BOOK_FAILED")

    async def book_characters(self, user_id: int, book_id: int):
        """获取书籍角色列表。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            (角色列表, None) 或 (None, 错误信息)。
        """
        try:
            result = await self.character_repo.book_character_detail(user_id, book_id)
            return result, None
        except Exception:
            logger.error("获取角色列表失败", exc_info=True)
            raise AppException(status_code=500, detail="获取角色列表失败", error_code="LIST_CHARACTERS_FAILED")

    async def book_info(self, user_id: int, book_id: int):
        """获取书籍基本信息。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            (书籍实例, None) 或 (None, 错误信息)。
        """
        try:
            result = await self.book_repo.by_user_book(user_id, book_id)
            return result, None
        except Exception:
            logger.error("获取书籍失败", exc_info=True)
            return None, "获取书籍失败"

    async def book_detail(self, user_id: int, book_id: int):
        """获取书籍详情，包含基础信息与角色列表。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            包含 book 与 characters 的字典，失败返回空字典。
        """
        try:
            book_data, _ = await self.book_info(user_id, book_id)
            character_data, _ = await self.book_characters(user_id, book_id)
            result = {
                "book": book_data,
                "characters": character_data or [],
            }
            return result
        except Exception:
            logger.error("获取书籍详情失败", exc_info=True)
            raise AppException(status_code=500, detail="获取书籍详情失败", error_code="GET_BOOK_DETAIL_FAILED")

    async def update_book(self, user_id: int, book_id: int, **kwargs):
        """更新书籍信息，需校验所有权。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。
            **kwargs: 要更新的字段。

        Returns:
            更新后的 Book 实例，不存在或无权访问返回 None。
        """
        instance = await self.book_repo.get(book_id)
        if not instance or instance.user_id != user_id:
            return None
        try:
            result = await self.book_repo.update_book(book_id, **kwargs)
            await self.session.commit()
            await self.session.refresh(result)
            return result
        except Exception:
            logger.error("书籍更新失败", exc_info=True)
            raise AppException(status_code=500, detail="更新书籍失败", error_code="UPDATE_BOOK_FAILED")

    async def delete_book(self, user_id: int, book_id: int):
        """删除书籍，需校验所有权。

        Args:
            user_id: 用户 ID。
            book_id: 书籍 ID。

        Returns:
            删除成功返回 True，否则返回 False。
        """
        instance = await self.book_repo.get(book_id)
        if instance.user_id != user_id:
            return False
        try:
            await self.book_repo.delete(book_id)
            await self.session.commit()
            return True
        except Exception:
            logger.error("书籍删除失败", exc_info=True)
            raise AppException(status_code=500, detail="删除书籍失败", error_code="DELETE_BOOK_FAILED")

    async def save_creative_setting(self, book_id: int, _user_id: int, setting):
        """保存或更新书籍创意设定。

        Args:
            book_id: 书籍 ID。
            _user_id: 用户 ID（当前未使用，预留）。
            setting: 设定字典。

        Returns:
            保存成功返回 True，否则返回 False。
        """
        try:
            instance = await self.creative_setting_repo.save_setting(book_id, setting)
            if instance.book_id != book_id:
                return False
            return True
        except Exception:
            logger.error("设定保存失败", exc_info=True)
            raise AppException(status_code=500, detail="保存创意设定失败", error_code="SAVE_CREATIVE_SETTING_FAILED")


async def book_db(db: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    """FastAPI 依赖注入：提供 BookService 实例。"""
    return BookService(db)
