from sqlalchemy import select
from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.project_repo import CharacterRepository
from model.book import Character
from utils.logger import get_logger

logger = get_logger(__name__)


class CharacterService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.character_repo = CharacterRepository(session)

    async def get_user_characters(self, user_id: int, book_id: int | None = None):
        try:
            stmt = select(Character).where(Character.user_id == user_id)
            if book_id is not None:
                stmt = stmt.where(Character.book_id == book_id)
            result = await self.session.execute(stmt)
            return result.scalars().all()
        except Exception:
            logger.error("获取角色列表失败", exc_info=True)
            return []

    async def get_character(self, user_id: int, character_id: int):
        try:
            instance = await self.character_repo.get(character_id)
            if instance and instance.user_id == user_id:
                return instance
            return None
        except Exception:
            logger.error("获取角色失败", exc_info=True)
            return None

    async def create_character(self, user_id: int, **data):
        try:
            data["user_id"] = user_id
            instance = await self.character_repo.add(**data)
            return instance
        except Exception:
            logger.error("创建角色失败", exc_info=True)
            return None

    async def update_character(self, user_id: int, character_id: int, **data):
        try:
            instance = await self.character_repo.get(character_id)
            if not instance or instance.user_id != user_id:
                return None
            for key, value in data.items():
                if value is not None:
                    setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except Exception:
            logger.error("更新角色失败", exc_info=True)
            return None

    async def delete_character(self, user_id: int, character_id: int):
        try:
            instance = await self.character_repo.get(character_id)
            if not instance or instance.user_id != user_id:
                return False
            await self.session.delete(instance)
            await self.session.commit()
            return True
        except Exception:
            logger.error("删除角色失败", exc_info=True)
            return False

    async def delete_character_avatar(self, user_id: int, character_id: int):
        try:
            instance = await self.character_repo.get(character_id)
            if not instance or instance.user_id != user_id:
                return None
            old_avatar = instance.avatar_url
            instance.avatar_url = None
            await self.session.commit()
            await self.session.refresh(instance)
            return old_avatar
        except Exception:
            logger.error("删除角色头像失败", exc_info=True)
            return None


async def character_db(db: AsyncSession = Depends(db_manager.get_db)):
    return CharacterService(db)
