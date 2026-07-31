from sqlalchemy import select
from shared.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from domains.book.repository import CharacterRepository
from models.book import Character
from config.logging import get_logger

logger = get_logger(__name__)


class CharacterService:
    """角色业务逻辑服务。

    提供角色查询、创建、更新与删除，统一做 user_id 权限校验。
    """

    def __init__(self, session: AsyncSession):
        """初始化 CharacterService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        self.character_repo = CharacterRepository(session)

    async def get_user_characters(self, user_id: int, book_id: int | None = None):
        """查询用户角色列表。

        Args:
            user_id: 用户 ID。
            book_id: 可选书籍 ID，用于过滤。

        Returns:
            角色实例列表。
        """
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
        """获取单个角色，校验所有权。

        Args:
            user_id: 用户 ID。
            character_id: 角色 ID。

        Returns:
            角色实例，不存在或无权访问返回 None。
        """
        try:
            instance = await self.character_repo.get(character_id)
            if instance and instance.user_id == user_id:
                return instance
            return None
        except Exception:
            logger.error("获取角色失败", exc_info=True)
            return None

    async def create_character(self, user_id: int, **data):
        """创建角色。

        Args:
            user_id: 用户 ID。
            **data: 角色字段。

        Returns:
            新创建的角色实例，失败返回 None。
        """
        try:
            data["user_id"] = user_id
            instance = await self.character_repo.add(**data)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except Exception:
            logger.error("创建角色失败", exc_info=True)
            return None

    async def update_character(self, user_id: int, character_id: int, **data):
        """更新角色，校验所有权。

        Args:
            user_id: 用户 ID。
            character_id: 角色 ID。
            **data: 要更新的字段。

        Returns:
            更新后的角色实例，失败返回 None。
        """
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
        """删除角色，校验所有权。

        Args:
            user_id: 用户 ID。
            character_id: 角色 ID。

        Returns:
            删除成功返回 True，否则返回 False。
        """
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
        """删除角色头像，校验所有权。

        Args:
            user_id: 用户 ID。
            character_id: 角色 ID。

        Returns:
            旧头像 URL，失败返回 None。
        """
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
    """FastAPI 依赖注入：提供 CharacterService 实例。"""
    return CharacterService(db)
