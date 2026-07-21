from typing import Annotated, List
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import get_current
from infrastructure.database import db_manager
from model import User
from schema.request.common import ChatRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from service.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["对话"])


@router.post(
    "/astream",
    summary="AI 流式对话",
    description=(
        "向 AI 发送问题，以 SSE (text/event-stream) 返回流式响应。需要携带 JWT token。\n\n"
        "SSE 事件类型：\n"
        "- `event:think` — 模型思考过程（部分模型支持）\n"
        "- `event:messages` — 模型回答内容片段\n"
        "- `event:done` — 流结束\n"
        "- `event:error` — 发生错误"
    ),
    responses={
        200: {"description": "SSE 流式响应"},
        401: {"description": "未授权，token 无效或过期"},
    },
)
async def ask_astream(
    request: ChatRequest,
    current: Annotated[User, Depends(get_current)],
    session: AsyncSession = Depends(db_manager.get_db),
):
    """流式对话接口：先将用户消息入库，再调用 LangGraph 流式产出回答。"""
    service = ChatService(session)
    return StreamingResponse(
        service.ask_stream(
            user_id=current.id,
            thread_id=request.thread_id,
            question=request.message,
        ),
        media_type="text/event-stream",
    )


@router.get(
    "/history",
    response_model=List[HistoryResponse],
    summary="获取对话历史列表",
    description="获取当前用户的所有会话列表，按最后更新时间倒序。需要携带 JWT token。",
)
async def history(
    current: Annotated[User, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    """获取当前用户的所有会话历史列表。"""
    service = ChatService(session)
    return await service.conv_repo.get_user_conv(current.id)


@router.get(
    "/messages",
    response_model=List[MessagesResponse],
    summary="获取会话消息列表",
    description="获取指定会话（conversation）下的所有消息。需要携带 JWT token。",
    responses={
        200: {"description": "消息列表"},
        401: {"description": "未授权"},
    },
)
async def messages(
    conv_id: int,
    thread_id: str,
    current: Annotated[User, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    """获取指定会话的消息列表。"""
    service = ChatService(session)
    return await service.msg_repo.get_conv_msg(conv_id)
