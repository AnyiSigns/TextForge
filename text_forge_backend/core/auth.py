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
        HTTPException: 令牌缺失、无效、过期、已登出或改密后旧令牌时抛出 401。
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

    # 登出黑名单：logout 时按 jti 加入黑名单，登出后的 access token 立即失效
    try:
        from shared.redis import redis_client

        if await redis_client.exists(f"auth:at_blacklist:{jti}"):
            logger.warning(f"已登出令牌被拒绝使用: user={user_id}")
            raise HTTPException(
                status_code=401,
                detail="令牌已失效，请重新登录",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # 改密版本号：修改密码后版本递增，改密前签发的所有 token 立即失效。
        # Redis 不可用时跳过校验（降级放行），保证登录流程不因缓存故障中断。
        current_ver = int(await redis_client.get(f"auth:pwd_ver:{user_id}") or 0)
        token_ver = int(payload.get("pwd_ver") or 0)
        if current_ver > token_ver:
            logger.warning(f"改密后旧令牌被拒绝使用: user={user_id}")
            raise HTTPException(
                status_code=401,
                detail="密码已修改，请重新登录",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"令牌校验附加检查失败（放行）: {exc}")
    return int(user_id)
