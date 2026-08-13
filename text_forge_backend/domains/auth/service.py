import os
import uuid
from datetime import datetime

from fastapi import Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from config.settings import settings
from core.security import create_token, encode_pwd, verify_pwd
from models.user import User
from shared.database import db_manager
from shared.redis import redis_client

from .repository import (
    UserRepository,
    UserTokenRepository,
)
from .verification import verification

logger = get_logger(__name__)


class UserAuthService:
    """用户认证服务层。

    提供注册、登录、密码修改、Token 刷新等核心认证能力。
    """

    def __init__(self, session: AsyncSession):
        """初始化 UserAuthService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        self.user_repo = UserRepository(session)
        self.token_repo = UserTokenRepository(session)

    async def user_register(self, user_name: str, pwd: str, email: str):
        """用户注册。

        Args:
            user_name: 用户名。
            pwd: 明文密码。
            email: 邮箱地址。

        Returns:
            (用户实例, None) 或 (None, 错误信息)。
        """
        exists_name = await self.user_repo.get_by_user_name(user_name)
        exists_email = await self.user_repo.query_user_email(email)

        if exists_name is not None:
            logger.info("用户名已存在")
            return None, "用户名已被注册"
        if exists_email:
            logger.info("邮箱已存在")
            return None, "邮箱已被注册"

        try:
            hash_pwd = encode_pwd(pwd)
            user = await self.user_repo.add(
                hash_password=hash_pwd, email=email, user_name=user_name
            )
            await self.session.commit()
            await self.session.refresh(user)
            logger.info("用户成功载入数据库")
            return user, None
        except Exception as e:
            logger.error(f"用户载入数据库失败:***{e}***")
            return None, "服务器错误,请稍后尝试"

    async def user_login(self, email: str, pwd: str):
        """用户登录。

        Args:
            email: 邮箱地址。
            pwd: 明文密码。

        Returns:
            (用户实例, access_token, refresh_token, None) 或
            (None, None, None, 错误信息)。
        """
        try:
            user = await self.user_repo.query_user_email(email)
            if not user:
                logger.info("用户不存在")
                return None, None, None, "邮箱或密码错误"
            if not verify_pwd(pwd, user.hash_password):
                logger.info("密码错误与数据库不一致")
                return None, None, None, "邮箱或密码错误"
            if not user.is_verified:
                logger.info("用户未验证邮箱")
                return None, None, None, "邮箱未验证，请先验证邮箱"

            at_jti = str(uuid.uuid4())
            # 携带当前密码版本号：改密后版本递增，改密前签发的 access token 全部失效
            try:
                pwd_ver = int(await redis_client.get(f"auth:pwd_ver:{user.id}") or 0)
            except Exception:
                pwd_ver = 0
            access_token = create_token(
                {
                    "sub": str(user.id),
                    "user_name": user.user_name,
                    "jti": at_jti,
                    "pwd_ver": pwd_ver,
                },
                expire=settings.JWT_ACCESS_TIME,
            )

            rt_jti = str(uuid.uuid4())
            expired_rt = datetime.now() + settings.JWT_EXPIRE_TIME
            refresh_token = create_token(
                {"sub": str(user.id), "user_name": user.user_name, "jti": rt_jti},
                settings.JWT_EXPIRE_TIME,
            )
            await self.token_repo.add(
                user_id=user.id, jti=rt_jti, expired_at=expired_rt
            )
            await self.session.commit()
            await redis_client.sadd(f"refresh_token_{user.id}", refresh_token)
            await redis_client.expire(
                f"refresh_token_{user.id}", int(settings.JWT_EXPIRE_TIME.total_seconds())
            )

            logger.info("用户登录成功")
            return user, access_token, refresh_token, None
        except Exception as e:
            logger.error(f"用户登录失败:***{e}***")
            return None, None, None, "服务器错误,请稍后尝试"

    async def old_new_password(self, old_pwd: str, new_pwd: str, user_id: int):
        """更改密码。

        Args:
            old_pwd: 旧密码。
            new_pwd: 新密码。
            user_id: 用户 ID。

        Raises:
            HTTPException: 旧密码错误时抛出 400。
        """
        user = await self.user_repo.get(user_id)
        hash_pwd = user.hash_password
        if not verify_pwd(old_pwd, hash_pwd):
            raise HTTPException(status_code=400, detail="旧密码错误")
        new_hash_pwd = encode_pwd(new_pwd)
        user.hash_password = new_hash_pwd
        await self.session.commit()
        await self._invalidate_all_tokens(user_id)

    async def change_password_by_email(self, email: str, code: str, new_pwd: str):
        """通过邮箱验证码更改密码。

        Args:
            email: 邮箱地址。
            code: 验证码。
            new_pwd: 新密码。

        Raises:
            HTTPException: 验证码无效或用户不存在时抛出。
        """
        verified = await verification.verify_code(email, code, "change_email")
        if not verified:
            raise HTTPException(status_code=400, detail="验证码无效或已过期")
        user = await self.user_repo.query_user_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        new_hash_pwd = encode_pwd(new_pwd)
        user.hash_password = new_hash_pwd
        await self.session.commit()
        await self._invalidate_all_tokens(user.id)

    async def _invalidate_all_tokens(self, user_id: int):
        """改密后使该用户全部 token 失效：递增密码版本号 + 删除所有 refresh token。

        Args:
            user_id: 用户 ID。
        """
        try:
            # 版本号递增：改密前签发的 access token（pwd_ver 更小）全部失效
            pipe = redis_client.pipeline()
            pipe.incr(f"auth:pwd_ver:{user_id}")
            pipe.expire(f"auth:pwd_ver:{user_id}", 2592000)  # 30 天
            await pipe.execute()
            # 删除全部 refresh token（DB + Redis 集合）
            await self.token_repo.delete_by_user(user_id)
            await self.session.commit()
            await redis_client.delete(f"refresh_token_{user_id}")
        except Exception as exc:
            logger.warning(
                f"改密后 token 失效处理失败（版本号仍已递增，refresh 接口受控）: {exc}"
            )

    async def delete_account(self, user_id: int, pwd: str, access_jti: str | None = None):
        """注销账号：校验密码后删除用户及全部关联数据（数据库外键级联）。

        Args:
            user_id: 用户 ID。
            pwd: 登录密码（注销确认）。
            access_jti: 当前 access token 的 JTI（非必传，注销后加入黑名单）。

        Raises:
            HTTPException: 用户不存在（404）或密码错误（400）时抛出。
        """
        user = await self.user_repo.get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        if not verify_pwd(pwd, user.hash_password):
            raise HTTPException(status_code=400, detail="密码错误")

        # 当前 access token 加入黑名单（TTL 取 access 默认有效期）
        if access_jti:
            try:
                await redis_client.setex(
                    f"auth:at_blacklist:{access_jti}",
                    int(settings.JWT_ACCESS_TIME.total_seconds()),
                    "1",
                )
            except Exception as exc:
                logger.warning(f"账号注销 access token 黑名单写入失败: {exc}")
        # 删除全部 refresh token（Redis 集合 + DB）
        try:
            await self.token_repo.delete_by_user(user_id)
            await self.session.commit()
        except Exception as exc:
            logger.warning(f"账号注销删除 token 失败: {exc}")
        try:
            await redis_client.delete(f"refresh_token_{user_id}")
        except Exception as exc:
            logger.warning(f"账号注销清理 refresh 集合失败: {exc}")
        try:
            await redis_client.delete(f"auth:pwd_ver:{user_id}")
        except Exception as exc:
            logger.warning(f"账号注销清理 pwd_ver 失败: {exc}")

        # 清理服务端头像文件（避免残留孤立文件）
        if user.avatar and user.avatar.startswith("/static/avatars/"):
            try:
                avatar_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                    "static",
                    "avatars",
                    os.path.basename(user.avatar),
                )
                if os.path.isfile(avatar_path):
                    os.remove(avatar_path)
            except Exception as exc:
                logger.warning(f"账号注销头像文件删除失败: {exc}")

        # 删除用户：全部关联数据（书籍/角色/工作流/文档/对话/剧情流/写作会话等）
        # 依赖数据库外键 ON DELETE CASCADE 级联删除，避免 ORM 逐对象加载开销。
        try:
            stmt = delete(User).where(User.id == user_id)
            await self.session.execute(stmt)
            await self.session.commit()
        except Exception as exc:
            await self.session.rollback()
            logger.error(f"账号注销删除用户失败: {exc}")
            raise HTTPException(status_code=500, detail="账号注销失败，请稍后重试")


async def user_db_serve(db: AsyncSession = Depends(db_manager.get_db)):
    """FastAPI 依赖注入：提供 UserAuthService 实例。"""
    return UserAuthService(db)
