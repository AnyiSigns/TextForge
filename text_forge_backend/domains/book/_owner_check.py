from fastapi import HTTPException
from models.book import Book
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def assert_book_owner(book_id: int, user_id: int, session: AsyncSession):
    stmt = select(Book).where(Book.id == book_id, Book.user_id == user_id)
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")
