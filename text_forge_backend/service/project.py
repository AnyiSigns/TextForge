from typing import Annotated
from sqlalchemy import select
from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.project_repo import (
    BookRepository,
    CharacterRepository,
    CreativeSettingRepository,
)
from model.book import Book
from utils.logger import get_logger

logger = get_logger(__name__)


class BookService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.book_repo = BookRepository(session)
        self.character_repo = CharacterRepository(session)
        self.creative_setting_repo = CreativeSettingRepository(session)

    async def query_user_books(self, user_id: int, **kwargs):
        try:
            result = await self.book_repo.by_user_parameter_book(user_id, **kwargs)
            if not result:
                return []
            return result
        except Exception:
            logger.error("查询错误", exc_info=True)
            return []

    async def create_book(self, **kwargs):
        try:
            user_id = kwargs.get("user_id")
            title = kwargs.get("title")
            if title and user_id:
                stmt = select(Book).where(Book.user_id == user_id, Book.title == title)
                result = await self.session.execute(stmt)
                if result.scalar_one_or_none():
                    raise ValueError("书名已存在")
            instance = await self.book_repo.add(**kwargs)
            return instance
        except ValueError:
            raise
        except Exception:
            logger.error("创建新书籍失败", exc_info=True)
            return None

    async def book_characters(self, user_id: int, book_id: int):
        try:
            result = await self.character_repo.book_character_detail(user_id, book_id)
            return result, None
        except Exception:
            logger.error("获取角色列表失败", exc_info=True)
            return None, "获取角色列表失败"

    async def book_info(self, user_id: int, book_id: int):
        try:
            result = await self.book_repo.by_user_book(user_id, book_id)
            return result, None
        except Exception:
            logger.error("获取书籍失败", exc_info=True)
            return None, "获取书籍失败"

    async def book_detail(self, user_id: int, book_id: int):
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
            return {}

    async def update_book(self, book_id: int, **kwargs):
        instance = await self.book_repo.update_book(book_id, **kwargs)
        if not instance:
            return None
        return instance

    async def delete_book(self, user_id: int, book_id: int):
        instance = await self.book_repo.get(book_id)
        if instance.user_id != user_id:
            return False
        try:
            await self.book_repo.delete(book_id)
            return True
        except Exception:
            logger.error("书籍删除失败", exc_info=True)
            return False

    async def save_creative_setting(self, book_id: int, _user_id: int, setting):
        try:
            instance = await self.creative_setting_repo.save_setting(book_id, setting)
            if instance.book_id != book_id:
                return False
            return True
        except Exception:
            logger.error("设定保存失败", exc_info=True)
            return False


async def book_db(db: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    return BookService(db)
