from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import verify_token
from fastapi.security import HTTPAuthorizationCredentials,HTTPBearer
from fastapi import Depends, HTTPException
from app.infrastructure.database import  db_manager
from app.repository.user_repo import UserRepository, UserTokenRepository
from app.utils.logger import get_logger



logger = get_logger(__name__)
security = HTTPBearer()     # HTTPBearer实例，用于从HTTP请求头中提取JWT令牌

async def get_current(
        credentials:Annotated[HTTPAuthorizationCredentials,Depends(security)],
        db:Annotated[AsyncSession,Depends(db_manager.get_db)]
):
    if credentials is None:
        logger.error("令牌不在请求头中",exc_info=True)
        raise HTTPException(
            status_code=401,
            detail="令牌不在请求头中",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    token=credentials.credentials
    payload=verify_token(token)
    if not payload:
        logger.warning("令牌异常",exc_info=True)
        raise HTTPException(
            status_code=401,
            detail="令牌异常",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    user_id=payload.get("sub")
    if not user_id:
        logger.warning("令牌中无用户id")
        raise HTTPException(
            status_code=401,
            detail="令牌中无用户id",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    user_repo=UserRepository(db)
    user=await user_repo.get(int(user_id))
    if not user:
        logger.warning("用户不存在")
        raise HTTPException(
            status_code=401,
            detail="用户不存在",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    jti=payload.get("jti")
    if not jti:
        logger.warning("令牌中无JTI")
        raise HTTPException(
            status_code=401,
            detail="令牌中无JTI",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )
    user_token_repo=UserTokenRepository(db)
    user_token=await user_token_repo.get_by_jti(jti)
    if not user_token:
        logger.warning("令牌不存在")
        raise HTTPException(
            status_code=401,
            detail="令牌不存在",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )
    return user




