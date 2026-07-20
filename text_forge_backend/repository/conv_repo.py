from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from model.conversation import Conversation
from repository.base_repo import BaseRepository



class ConversationRepository(BaseRepository[Conversation]):
    """历史会话CRUD"""
    def __init__(self,session:AsyncSession):
        self.session=session
        super().__init__(Conversation,session)

    async def get_user_conv(self,user_id:int,offset:int=0,limit:int=20):
        """获取用户的所有对话"""
        stmt=select(Conversation).where(
            Conversation.user_id == user_id
        ).order_by(
            Conversation.update_at.desc()
        ).offset(offset).limit(limit)
        result=await self.session.execute(stmt)
        return result.scalars().all()

    async def get_thread_conv(self,thread_id:str):
        """根据线程id获取会话"""
        stmt=select(Conversation).where(Conversation.thread_id==thread_id)
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_and_conv(self,user_id:int,conv_id:int):
        """根据用户id和历史记录id获取会话"""
        stmt=select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.id == conv_id
        )
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_and_thread(self,user_id:int,thread_id:str):
        """根据用户id和线程id获取会话"""
        stmt=select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.thread_id == thread_id
        )
        result=await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_user_thread_conv(self,user_id:int,thread_id:str):
        """根据用户id线程id创建会话"""
        try:
            query = await self.add(user_id=user_id, thread_id=thread_id)
            return query,None
        except IntegrityError:
            await self.session.rollback()
            return False, "会话已存在"
        except Exception as e:
            await self.session.rollback()
            return False,f"会话创建异常{e}"

    async def delete_user_conv(self,user_id:int):
        """删除用户所有历史会话列表"""
        query=await self.get_user_conv(user_id)
        if not query:
            return False, "用户会话不存在"
        stmt=delete(Conversation).where(Conversation.user_id==user_id)
        await self.session.execute(stmt)
        await self.session.commit()
        return True, "会话删除成功"

    async def change_title(self,conv_id:int):
        """修改会话标题"""





