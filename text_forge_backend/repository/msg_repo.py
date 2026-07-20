from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.model.conversation import Message
from app.repository.base_repo import BaseRepository


class MessageRepository(BaseRepository[Message]):
    """会话内容CRUD"""
    def __init__(self,session:AsyncSession):
        self.session=session
        super().__init__(Message,session)


    async def get_conv_msg(self,conv_id:int,offset:int=0,limit:int=50):
        """获取该会话的所有内容"""
        stmt=select(Message).where(
           Message.conversation_id==conv_id
        ).order_by(Message.id).offset(offset).limit(limit)
        result=await self.session.execute(stmt)
        return result.scalars().all()


    async def count_conv_msg(self,conv_id:int)->int:
        """获取该会话的消息总数"""
        stmt=select(func.count(Message.id)).where(
            Message.conversation_id==conv_id
        )
        result=await self.session.execute(stmt)
        return result.scalar_one()



