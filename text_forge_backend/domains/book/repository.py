from models.book import Book, Character, CreativeSetting
from shared.base_repo import BaseRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class BookRepository(BaseRepository[Book]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Book, session)

    async def by_user_parameter_book(self, user_id: int, **kwargs):
        field_map = {"genre": Book.genre}
        parameter = []
        for key, value in kwargs.items():
            if value is not None and key in field_map:
                parameter.append(field_map[key] == value)
        stmt = select(Book).where(Book.user_id == user_id, *parameter)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def by_user_book(self, user_id: int, book_id: int):
        stmt = select(Book).where(Book.user_id == user_id, Book.id == book_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_book(self, book_id: int, **kwargs) -> Book | None:
        # 注意：不能走 self.update（其签名是 book_id, user_id, data，缺少 user_id 会 TypeError）。
        # 所有权校验已在 service 层完成，这里直接按字段更新。
        instance = await self.get(book_id)
        if not instance:
            return None
        for key, value in kwargs.items():
            # workflow_id 允许设为 None 以解除绑定；其余字段仅在有值时才覆盖
            if key == "workflow_id" or value is not None:
                setattr(instance, key, value)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, book_id: int, user_id: int, data: dict) -> Book | None:
        instance = await self.get(book_id)
        if not instance or instance.user_id != user_id:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance


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
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def save_setting(self, book_id: int, setting: dict):
        stmt = select(CreativeSetting).where(CreativeSetting.book_id == book_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if not instance:
            instance = await self.add_setting(book_id, setting)
            return instance
        for key, value in setting.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def get_setting(self, book_id: int):
        stmt = select(CreativeSetting).where(CreativeSetting.book_id == book_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
