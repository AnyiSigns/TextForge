import os
import uuid

from fastapi import Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.exceptions import AppException
from models.book import Character, Foreshadowing, PlotThread, SceneEvent
from models.context_config import BookContextConfig
from shared.database import db_manager

from .repository import CharacterRepository

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
            raise AppException(status_code=500, detail="获取角色列表失败", error_code="LIST_CHARACTERS_FAILED")

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
            raise AppException(status_code=500, detail="获取角色失败", error_code="GET_CHARACTER_FAILED")

    async def create_character(self, user_id: int, **data):
        """创建角色。

        按 (book_id, name) 幂等：同名角色已存在时直接返回已有实例，
        避免初始化器前端按名称去重因并发/分页上限而重复落库。

        Args:
            user_id: 用户 ID。
            **data: 角色字段。

        Returns:
            新创建（或已存在）的角色实例，失败返回 None。
        """
        try:
            name = data.get("name")
            book_id = data.get("book_id")
            if name and book_id:
                stmt = select(Character).where(
                    Character.book_id == book_id, Character.name == name
                )
                existing = (await self.session.execute(stmt)).scalar_one_or_none()
                if existing:
                    return existing
            data["user_id"] = user_id
            instance = await self.character_repo.add(**data)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except Exception:
            logger.error("创建角色失败", exc_info=True)
            raise AppException(status_code=500, detail="创建角色失败", error_code="CREATE_CHARACTER_FAILED")

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
            raise AppException(status_code=500, detail="更新角色失败", error_code="UPDATE_CHARACTER_FAILED")

    async def delete_character(self, user_id: int, character_id: int):
        """删除角色，校验所有权。

        删除前清理 JSONB 数组中的角色引用（场景事件/伏笔/情节线/书籍设定配置）
        并删除磁盘头像文件，避免残留陈旧 ID 与孤儿文件。

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
            cid = character_id
            for model, field in (
                (SceneEvent, "character_ids"),
                (Foreshadowing, "related_character_ids"),
                (PlotThread, "related_character_ids"),
                (BookContextConfig, "character_ids"),
            ):
                rows = (
                    await self.session.execute(
                        select(model).where(getattr(model, field).contains([cid]))
                    )
                ).scalars().all()
                for row in rows:
                    setattr(
                        row,
                        field,
                        [x for x in (getattr(row, field) or []) if x != cid],
                    )
            old_avatar = instance.avatar_url
            await self.session.delete(instance)
            await self.session.commit()
            if old_avatar and old_avatar.startswith("/static/"):
                try:
                    # 头像文件实际位于 <root>/static/avatars/<filename>，
                    # 直接基于 URL 相对路径定位，避免目录层级拼错
                    save_path = os.path.join(
                        os.path.dirname(
                            os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                        ),
                        old_avatar.lstrip("/"),
                    )
                    if os.path.exists(save_path):
                        os.remove(save_path)
                except OSError as exc:
                    logger.warning(f"删除角色头像文件失败: {exc}")
            return True
        except Exception:
            logger.error("删除角色失败", exc_info=True)
            raise AppException(status_code=500, detail="删除角色失败", error_code="DELETE_CHARACTER_FAILED")

    async def upload_character_avatar(self, character_id: int, file: UploadFile):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="请上传图片文件（JPG / PNG / WebP / GIF）")

        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP / GIF 格式的头像")

        # 体积校验：先探测大小，避免把超大文件读进内存
        try:
            await file.seek(0, 2)
            size = await file.tell()
            await file.seek(0)
        except Exception:
            size = None
        if size is not None and size > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="头像文件过大，请压缩到 5MB 以内")

        filename = f"char_{character_id}_{uuid.uuid4().hex[:8]}{ext}"
        save_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "static",
            "avatars",
        )
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)

        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)

        avatar_url = f"/static/avatars/{filename}"
        instance = await self.character_repo.get(character_id)
        instance.avatar_url = avatar_url
        await self.session.commit()
        await self.session.refresh(instance)
        return {"avatarUrl": avatar_url}

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
            raise AppException(status_code=500, detail="删除角色头像失败", error_code="DELETE_CHARACTER_AVATAR_FAILED")


async def character_db(db: AsyncSession = Depends(db_manager.get_db)):
    """FastAPI 依赖注入：提供 CharacterService 实例。"""
    return CharacterService(db)
