import uuid
from datetime import datetime
from typing import Optional
from fastapi import Depends
from config.settings import settings
from infrastructure.database import db_manager
from utils.logger import get_logger
from repository.user_repo import UserTokenRepository,UserRepository
from core.security import encode_pwd,verify_pwd
from core.security import create_token



logger = get_logger(__name__)

class UserAuthService:
    def __init__(self,session:AsyncSession):
        self.session=session
        self.user_repo=UserRepository(session)
        self.token_repo=UserTokenRepository(session)

    async def user_register(
            self,
            user_name:str,
            pwd:str,
            email:str,
            phone:Optional[str]=None
    ):
        """用户注册"""
        exists_name=await self.user_repo.get_by_user_name(user_name)
        exists_email=await self.user_repo.query_user_email(email)

        if exists_name is not None:
            logger.info("用户名已存在")
            return None,"用户名已被注册"
        if exists_email:
            logger.info("邮箱已存在")
            return None,"邮箱已被注册"

        if phone:
            exists_phone=await self.user_repo.query_user_phone(phone)
            if exists_phone:
                logger.info("手机号已存在")
                return None, "手机号已被注册"

        try:
            hash_pwd=encode_pwd(pwd)
            user=await self.user_repo.add(
                user_name=user_name,
                hash_password=hash_pwd,
                email=email,
                phone=phone if phone else None
            )
            logger.info("用户成功载入数据库")
            return user,None
        except Exception as e:
            logger.error(f"用户载入数据库失败:***{e}***")
            return None,"服务器错误,请稍后尝试"

    async def user_login(self,user_name:str,pwd:str):
        """用户登录"""
        try:
            user = await self.user_repo.get_by_user_name(user_name)
            if not user:
                logger.info("用户不存在")
                return None, "用户名错误"
            if not verify_pwd(pwd, user.hash_password):
                logger.info("密码错误与数据库不一致")
                return None, "密码错误"

            jti = str(uuid.uuid4())
            expired_at = datetime.now() + settings.JWT_EXPIRE_TIME
            await self.token_repo.add(
                user_id=user.id,
                jti=jti,
                expired_at=expired_at
            )

            access_token = create_token(
                {
                    "sub": str(user.id),
                    "user_name": user_name,
                    "jti": jti
                }
            )

            logger.info("用户登录成功")
            return access_token, None
        except Exception as e:
            logger.error(f"用户登录失败:***{e}***")
            return None, "服务器错误,请稍后尝试"

async def user_db_serve(db:AsyncSession=Depends(db_manager.get_db)):
    return UserAuthService(db)