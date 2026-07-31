from sqlalchemy.ext.asyncio import AsyncSession
from models.base import Base

from typing import TypeVar, Generic, Type

ModelType = TypeVar(
    "ModelType", bound=Base
)  # 模型类型，继承自Base, 用于泛型约束,只能是Base的子类


class BaseRepository(Generic[ModelType]):
    """通用仓储基类。

    提供基于 SQLAlchemy 2.x 异步会话的基础 CRUD 能力。
    """

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        """初始化 BaseRepository。

        Args:
            model: ORM 模型类。
            session: SQLAlchemy 异步会话。
        """
        self.model = model
        self.session = session

    async def add(self, **kwargs):
        """新增实体。

        仅执行 flush + refresh，不自动 commit，
        以便上层在事务内完成多表写入后统一提交。

        Returns:
            新创建的实体实例。
        """
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def add_and_commit(self, **kwargs):
        """新增实体并立即 commit（向后兼容）。

        .. deprecated::
            优先使用 add() 后由上层统一 commit。

        Returns:
            新创建的实体实例。
        """
        instance = await self.add(**kwargs)
        await self.session.commit()
        return instance

    async def get(self, id):
        """根据主键获取实体。

        Args:
            id: 主键值。

        Returns:
            实体实例，不存在返回 None。
        """
        return await self.session.get(self.model, id)

    async def delete(self, id):
        """根据主键删除实体。

        Args:
            id: 主键值。

        Returns:
            删除成功返回 True，实体不存在返回 False。
        """
        instance = await self.get(id)
        if instance:
            await self.session.delete(instance)
            await self.session.commit()
            return True
        else:
            return False

    async def update(self, id, **kwargs):
        """根据主键更新实体。

        Args:
            id: 主键值。
            **kwargs: 要更新的字段，仅更新非 None 值。

        Returns:
            更新后的实体实例，不存在返回 None。
        """
        instance = await self.get(id)
        if instance:
            for key, value in kwargs.items():
                if value is not None:
                    setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        else:
            return None
