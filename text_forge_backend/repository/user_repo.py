from ast import stmt
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from model import UserToken
from repository.base_repo import BaseRepository
from model.user import User


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
