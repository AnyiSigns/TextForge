from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated, List
from core.auth import get_current
from infrastructure.database import db_manager
from model import User
from schema.request.common import ChatRequest
from schema.response.chat import HistoryResponse, MessagesResponse
from service.chat_service import ChatService



router=APIRouter(prefix="/chat",tags=["Chat"])

@router.post("/astream")
async def ask_astream(
        request:ChatRequest,
        current:Annotated[User,Depends(get_current)],
        session:AsyncSession=Depends(db_manager.get_db)
):
    service=ChatService(session)
    return StreamingResponse(
        service.ask_stream(
            user_id=current.id,
            thread_id=request.thread_id,
            question=request.message
        ),
        media_type="text/event-stream"
    )

@router.get("/history",response_model=List[HistoryResponse])
async def history(current:Annotated[User,Depends(get_current)],session:Annotated[AsyncSession,Depends(db_manager.get_db)]):
    service=ChatService(session)
    data=await service.conv_repo.get_user_conv(current.id)
    return data

@router.get("/messages",response_model=List[MessagesResponse])
async def messages(
        conv_id:int,
        thread_id:str,
        current:Annotated[User,Depends(get_current)],
        session:Annotated[AsyncSession,Depends(db_manager.get_db)]
):
    service=ChatService(session)
    data=await service.msg_repo.get_conv_msg(conv_id)
    return data
