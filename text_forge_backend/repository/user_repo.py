from ast import stmt
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from model import UserToken
from repository.base_repo import BaseRepository
from model.user import User
from model.project import ModelConfig


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(User, session)

    async def get_by_user_name(self, user_name: str):
        """根据用户名查询用户"""
        stmt = select(User).where(User.user_name == user_name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_user_email(self, email: str):
        """根据邮箱查询用户"""
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_email_verified(self, email: str):
        """根据邮箱查询用户验证状态"""
        user = await self.query_user_email(email)
        if user.is_verified:  # type: ignore
            return user, True
        return user, False

    async def updata_verified(self, email: str, status: bool):
        user = await self.query_user_email(email)
        user.is_verified = status  # type: ignore
        return True

    async def create_user(
        self,
        user_name: str,
        email: str,
        hash_password: str,
        phone: Optional[str] = None,
    ):
        """创建用户"""
        return await self.add(
            user_name=user_name, email=email, hash_password=hash_password, phone=phone
        )


class UserTokenRepository(BaseRepository[UserToken]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(UserToken, session)

    async def delete_user_and_jti(self, user_id: int, jti: str):
        """根据用户id和jti删除单个"""
        stmt = delete(UserToken).where(
            UserToken.user_id == user_id, UserToken.jti == jti
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def delete_by_jti(self, jti: str):
        """删除jti"""
        stmt = delete(UserToken).where(UserToken.jti == jti)
        await self.session.execute(stmt)
        await self.session.commit()

    async def delete_by_user(self, user_id: int):
        stmt = delete(UserToken).where(UserToken.user_id == user_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_by_user_and_jti(self, jti: str, user_id: int):
        """查询jti"""
        stmt = select(UserToken).where(
            UserToken.jti == jti, UserToken.user_id == user_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class ModelConfRepository(BaseRepository[ModelConfig]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(ModelConfig, session)

    async def create_model_config(self, user_id: int, model_conf: dict):
        instance = await self.add(
            user_id=user_id,
            main_config=model_conf["main_config"],
            compression=model_conf["compression"],
            router_config=model_conf["router_config"],
            tool_config=model_conf["tool_config"],
            vision_config=model_conf["vision_config"],
            embedding_config=model_conf["embedding_config"],
        )
        return instance

    async def update_model_config(self, user_id: int, model_conf: dict):
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if not instance:
            instance = await self.create_model_config(user_id, model_conf)
        if instance:
            for key, value in model_conf.items():
                if key in ("id", "user_id"):
                    continue
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        return instance

    async def query_user_model(self, user_id: int):
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        instance = await self.session.execute(stmt)
        return instance.scalar_one_or_none()
