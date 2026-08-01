
from models import UserToken
from models.user import User
from shared.base_repo import BaseRepository
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


class UserRepository(BaseRepository[User]):
    """用户仓储，提供用户查询与基础操作。"""

    def __init__(self, session: AsyncSession):
        """初始化 UserRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(User, session)

    async def get_by_user_name(self, user_name: str):
        """根据用户名查询用户。

        Args:
            user_name: 用户名。

        Returns:
            User 实例，不存在返回 None。
        """
        stmt = select(User).where(User.user_name == user_name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_user_email(self, email: str):
        """根据邮箱查询用户。

        Args:
            email: 邮箱地址。

        Returns:
            User 实例，不存在返回 None。
        """
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_email_verified(self, email: str):
        """根据邮箱查询用户验证状态。

        Args:
            email: 邮箱地址。

        Returns:
            (User 实例, 是否已验证)。
        """
        user = await self.query_user_email(email)
        if user.is_verified:  # type: ignore
            return user, True
        return user, False

    async def update_verified(self, email: str, status: bool):
        """更新用户邮箱验证状态。

        Args:
            email: 邮箱地址。
            status: 验证状态。

        Returns:
            始终返回 True。
        """
        user = await self.query_user_email(email)
        user.is_verified = status  # type: ignore
        await self.session.commit()
        await self.session.refresh(user)
        return True

    async def create_user(
        self,
        user_name: str,
        email: str,
        hash_password: str,
        phone: str | None = None,
    ):
        """创建用户。

        Args:
            user_name: 用户名。
            email: 邮箱地址。
            hash_password: 哈希密码。
            phone: 手机号。

        Returns:
            新创建的用户实例。
        """
        instance = await self.add(
            user_name=user_name, email=email, hash_password=hash_password, phone=phone
        )
        await self.session.commit()
        await self.session.refresh(instance)
        return instance


class UserTokenRepository(BaseRepository[UserToken]):
    """用户 Token 仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 UserTokenRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(UserToken, session)

    async def delete_user_and_jti(self, user_id: int, jti: str):
        """根据用户 ID 和 JTI 删除单个 Token。

        Args:
            user_id: 用户 ID。
            jti: JWT ID。
        """
        stmt = delete(UserToken).where(
            UserToken.user_id == user_id, UserToken.jti == jti
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def delete_by_jti(self, jti: str):
        """根据 JTI 删除 Token。

        Args:
            jti: JWT ID。
        """
        stmt = delete(UserToken).where(UserToken.jti == jti)
        await self.session.execute(stmt)
        await self.session.commit()

    async def delete_by_user(self, user_id: int):
        """删除用户所有 Token。

        Args:
            user_id: 用户 ID。
        """
        stmt = delete(UserToken).where(UserToken.user_id == user_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_by_user_and_jti(self, jti: str, user_id: int):
        """根据 JTI 和用户 ID 查询 Token。

        Args:
            jti: JWT ID。
            user_id: 用户 ID。

        Returns:
            UserToken 实例，不存在返回 None。
        """
        stmt = select(UserToken).where(
            UserToken.jti == jti, UserToken.user_id == user_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
