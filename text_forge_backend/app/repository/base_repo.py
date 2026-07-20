from sqlalchemy.ext.asyncio import AsyncSession
from app.model.base import Base

from typing import TypeVar,Generic,Type

ModelType = TypeVar("ModelType", bound=Base)    # 模型类型，继承自Base, 用于泛型约束,只能是Base的子类

class BaseRepository(Generic[ModelType]):
    def __init__(self,model:Type[ModelType],session:AsyncSession):
        self.model=model
        self.session=session

    async def add(self,**kwargs):
        instance=self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.commit()
        return instance

    async def get(self,id):
        """根据id获取实例"""
        return await self.session.get(self.model,id)

    async def delete(self,id):
        """根据id删除实例"""
        instance=await self.get(id)
        if instance:
            await self.session.delete(instance)
            await self.session.commit()
            return True
        else:
            return False

    async def update(self,id,**kwargs):
        """根据id更新实例"""
        instance=await self.get(id)
        if instance:
            for key,value in kwargs.items():
                setattr(instance,key,value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        else:
            return None

