import json
from utils.logger import get_logger
from agents.graphs.registry import graph_register
from agents.llm import llm
from repository.conv_repo import ConversationRepository
from repository.msg_repo import MessageRepository


logger = get_logger(__name__)

class ChatService:
    """对话服务"""
    def __init__(self,session:AsyncSession):
        self.session=session
        self.llm=llm    #语言模型，已绑定工具
        self.conv_repo=ConversationRepository(session)
        self.msg_repo=MessageRepository(session)

    async def create_conv(self,user_id:int,thread_id:str):
        """创建会话"""
        query,error=await self.conv_repo.create_user_thread_conv(user_id,thread_id)
        if not query:
            raise RuntimeError(f"创建会话出错：{error}")
        return query

    async def get_conv(self,user_id:int,thread_id:str):
        """获取会话"""
        conv=await self.conv_repo.get_user_and_thread(user_id,thread_id)
        if not conv:
            try:
                conv = await self.create_conv(user_id, thread_id)
            except RuntimeError:
                await self.session.rollback()
                conv=await self.conv_repo.get_user_and_thread(user_id,thread_id)
        if not conv:
            raise RuntimeError(f"无法获取或创建会话：user_id={user_id}, thread_id={thread_id}")
        return conv

    async def add_msg(self,user_id:int,thread_id:str,role:str,content:str,think:Optional[str]=None):
        """添加会话内容"""
        conv=await self.get_conv(user_id=user_id,thread_id=thread_id)
        if not conv:
            return
        await self.msg_repo.add(role=role,content=content,think=think,conversation_id=conv.id)

    async def ask_stream(self,user_id:int,thread_id:str,question:str):
        """处理用户提问，返回流式响应"""
        ai_think_text=""
        ai_content_text=""

        input_message = {
            "messages": [HumanMessage(content=question)]
        }

        try:
            await self.add_msg(user_id, thread_id, "user", content=question)
        except Exception as e:
            logger.error(f"添加用户消息出错：{e}")
            yield f"event:error\ndata:{json.dumps({'content':str(e),'done':True})}\n\n"
            return

        try:
            graph=graph_register.get_compiled("chat")
            async for chunk, metadata in graph.astream(
                    input_message,
                    stream_mode="messages",
                    config={"configurable": {"thread_id": thread_id}}
            ):
                if isinstance(chunk, AIMessage):
                    node = metadata["langgraph_node"]
                    if node != "agent":
                        continue

                    think_content = chunk.additional_kwargs.get("reasoning_content") or chunk.response_metadata.get(
                        "reasoning_content")
                    if think_content:
                        ai_think_text +=  think_content
                        yield f"event:think\ndata:{json.dumps({'content': think_content, 'done': False})}\n\n"
                    if chunk.content:
                        ai_content_text += chunk.content
                        yield f"event:messages\ndata:{json.dumps({'content': chunk.content, 'done': False})}\n\n"
            yield f"event:done\ndata:{json.dumps({'status': 'completed'})}\n\n"
            await self.add_msg(user_id, thread_id, role="assistant", content=ai_content_text, think=ai_think_text)

        except Exception as e:
            logger.error(f"处理用户提问出错：{e}")
            yield f"event:error\ndata:{json.dumps({'content':str(e),'done':True})}\n\n"



