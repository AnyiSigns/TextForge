from datetime import datetime
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.model import UserToken
from app.repository.base_repo import BaseRepository
from app.model.user import User

class UserRepository(BaseRepository[User]):
    def __init__(self,session:AsyncSession):
        self.session=session
        super().__init__(User,session)

    async def get_by_user_name(self,user_name:str):
        """根据用户名查询用户"""
        stmt=select(User).where(User.user_name==user_name)
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_user_email(self,email:str):
        """根据邮箱查询用户"""
        stmt=select(User).where(User.email==email)
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_user_phone(self,phone:Optional[str]=None):
        """根据手机号查询用户"""
        stmt=select(User).where(User.phone==phone)
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_user(self,user_name:str,email:str,hash_password:str,phone:Optional[str]=None):
        """创建用户"""
        return await self.add(user_name=user_name,email=email,hash_password=hash_password,phone=phone)


class UserTokenRepository(BaseRepository[UserToken]):
    def __init__(self,session:AsyncSession):
        self.session=session
        super().__init__(UserToken,session)

    async def delete_by_jti(self,jti:str):
        """删除jti"""
        stmt=delete(UserToken).where(UserToken.jti==jti)
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_by_jti(self,jti:str):
        """查询jti"""
        stmt=select(UserToken).where(UserToken.jti==jti)
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()
