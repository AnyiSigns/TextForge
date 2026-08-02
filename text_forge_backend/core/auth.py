from typing import Annotated

from config.logging import get_logger
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.security import verify_token

logger = get_logger(__name__)
security = HTTPBearer()  # HTTPBearer实例，用于从HTTP请求头中提取JWT令牌


async def get_current(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
):
    """FastAPI 依赖：从 JWT 提取当前用户 ID。

    Args:
        credentials: HTTP Bearer 凭证。

    Returns:
        当前用户 ID。

    Raises:
        HTTPException: 令牌缺失、无效或过期时抛出 401。
    """
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
