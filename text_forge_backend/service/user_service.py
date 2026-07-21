from typing import Optional
import uuid
import json
from datetime import datetime
from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from config.settings import settings
from infrastructure.database import db_manager
from utils.logger import get_logger
from repository.user_repo import UserTokenRepository, UserRepository
from core.security import encode_pwd, verify_pwd
from core.security import create_token
from config.redis_config import redis_client as redis
from service.verification_service import verifacation

logger = get_logger(__name__)


class UserAuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.token_repo = UserTokenRepository(session)

    async def user_register(self, user_name: str, pwd: str, email: str):
        """用户注册"""
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
                hash_password=hash_pwd,
                email=email,
            )
            logger.info("用户成功载入数据库")
            return user, None
        except Exception as e:
            logger.error(f"用户载入数据库失败:***{e}***")
            return None, "服务器错误,请稍后尝试"

    async def user_login(self, email: str, pwd: str):
        """用户登录"""
        try:
            user = await self.user_repo.query_user_email(email)
            if not user:
                logger.info("用户不存在")
                return None, None, None, "邮箱错误"
            if not verify_pwd(pwd, user.hash_password):
                logger.info("密码错误与数据库不一致")
                return None, None, None, "密码错误"

            at_jti = str(uuid.uuid4())
            access_token = create_token(
                {"sub": str(user.id), "user_name": user.user_name, "jti": at_jti},
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
            redis.sadd(f"refresh_token_{user.id}", refresh_token)
            redis.expire(f"refresh_token_{user.id}", 604800)

            logger.info("用户登录成功")
            return user, access_token, refresh_token, None
        except Exception as e:
            logger.error(f"用户登录失败:***{e}***")
            return None, None, None, "服务器错误,请稍后尝试"

    async def old_new_password(self, old_pwd: str, new_pwd: str, user_id: int):
        """更改密码"""
        user = await self.user_repo.get(user_id)
        hash_pwd = user.hash_password
        if not verify_pwd(old_pwd, hash_pwd):
            raise HTTPException(status_code=400, detail="旧密码错误")
        new_hash_pwd = encode_pwd(new_pwd)
        user.hash_password = new_hash_pwd
        await self.session.commit()
        return

    async def change_password_by_email(self, email: str, code: str, new_pwd: str):
        """通过邮箱验证码更改密码"""
        verified = await verifacation.verify_code(email, code)
        if not verified:
            raise HTTPException(status_code=400, detail="验证码无效或已过期")
        user = await self.user_repo.query_user_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        new_hash_pwd = encode_pwd(new_pwd)
        user.hash_password = new_hash_pwd
        await self.session.commit()
        return


async def user_db_serve(db: AsyncSession = Depends(db_manager.get_db)):
    return UserAuthService(db)
