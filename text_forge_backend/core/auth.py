from datetime import datetime
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from core.security import create_token, verify_token
from infrastructure.database import db_manager
from repository.user_repo import UserRepository, UserTokenRepository
from config.settings import settings
from utils.logger import get_logger
from config.redis_config import redis_client as r
import json
import uuid

logger = get_logger(__name__)
security = HTTPBearer()  # HTTPBearer实例，用于从HTTP请求头中提取JWT令牌


async def get_current(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    if credentials is None:
        logger.error("令牌不在请求头中", exc_info=True)
        raise HTTPException(
            status_code=401,
            detail="令牌不在请求头中",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        logger.warning("令牌异常", exc_info=True)
        raise HTTPException(
            status_code=401, detail="令牌异常", headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = payload.get("sub")
    if not user_id:
        logger.warning("令牌中无用户id")
        raise HTTPException(
            status_code=401,
            detail="令牌中无用户id",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if not jti:
        logger.warning("令牌中无JTI")
        raise HTTPException(
            status_code=401,
            detail="令牌中无JTI",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return int(user_id)
