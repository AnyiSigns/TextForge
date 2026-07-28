from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.book import Book, Character, CreativeSetting


class BookRepository(BaseRepository[Book]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Book, session)

    async def by_user_parameter_book(self, user_id: int, **kwargs):
        field_map = {"genre": Book.genre}
        parameter = []
        for key, value in kwargs.items():
            if value is not None:
                parameter.append(field_map[key] == value)
        stmt = select(Book).where(Book.user_id == user_id, *parameter)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def by_user_book(self, user_id: int, book_id: int):
        stmt = select(Book).where(Book.user_id == user_id, Book.id == book_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_book(self, book_id: int, **kwargs) -> Book | None:
        result = await self.update(book_id, **kwargs)
        return result


class CharacterRepository(BaseRepository[Character]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Character, session)

    async def book_character_detail(self, user_id: int, book_id: int):
        stmt = select(Character).where(Character.user_id == user_id, Character.book_id == book_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()


class CreativeSettingRepository(BaseRepository[CreativeSetting]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(CreativeSetting, session)

    async def add_setting(self, book_id: int, setting: dict):
        data = {k: v for k, v in setting.items() if k != "book_id"}
        instance = await self.add(book_id=book_id, **data)
        return instance

    async def save_setting(self, book_id: int, setting: dict):
        instance = await self.get(book_id)
        if not instance:
            instance = await self.add_setting(book_id, setting)
            return instance
        instance = await self.update(book_id, **setting)
        return instance

    async def get_setting(self, book_id: int):
        return await self.get(book_id)
