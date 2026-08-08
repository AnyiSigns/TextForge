import uuid
from datetime import datetime, timezone
from typing import Annotated

from config.logging import get_logger
from config.settings import settings
from core.security import create_token, verify_token
from fastapi import APIRouter, Depends, HTTPException
from schema.request.auth import (
    EmailRequest,
    RefreshRequest,
    UserLogin,
    UserRequest,
    VerifyEmailRequest,
)
from schema.response.auth import (
    RefreshResponse,
    TokenRes,
    UserResponse,
)
from shared.redis import redis_client

from .email import email_service
from .service import UserAuthService, user_db_serve
from .verification import verification

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/logout")
async def logout(
    request: RefreshRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    """登出：删除 refresh token，并将 access token 加入黑名单立即失效。"""
    payload = verify_token(request.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效")
    user_id = int(payload.get("sub"))
    jti = payload.get("jti")
    await user_serve.token_repo.delete_user_and_jti(user_id, jti)
    await redis_client.srem(f"refresh_token_{user_id}", request.refresh_token)
    # access token 黑名单：jti → 黑名单，TTL 取 access 剩余有效期（默认 15 分钟）
    access_token = request.access_token
    if access_token:
        at_payload = verify_token(access_token)
        at_jti = at_payload.get("jti") if at_payload else None
        if at_jti:
            try:
                exp_ts = at_payload.get("exp")
                ttl = (
                    max(int(exp_ts) - int(datetime.now(timezone.utc).timestamp()), 1)
                    if exp_ts
                    else int(settings.JWT_ACCESS_TIME.total_seconds())
                )
                await redis_client.setex(f"auth:at_blacklist:{at_jti}", ttl, "1")
            except Exception as exc:
                logger.warning(f"access token 黑名单写入失败: {exc}")
    return {"ok": True}


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_at(
    request: RefreshRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    payload = verify_token(request.refresh_token)
    user_id = payload.get("sub")
    user_id = int(user_id)
    rt_jti = payload.get("jti")
    user = await user_serve.user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    user_token = await user_serve.token_repo.get_by_user_and_jti(rt_jti, user.id)
    if not user_token:
        raise HTTPException(status_code=401, detail="用户/令牌不存在")
    if not await redis_client.sismember(f"refresh_token_{user_id}", request.refresh_token):
        raise HTTPException(status_code=401, detail="令牌不存在")
    at_jti = str(uuid.uuid4())
    # 携带当前密码版本号：改密后版本递增，旧 access token 立即失效
    try:
        pwd_ver = int(await redis_client.get(f"auth:pwd_ver:{user.id}") or 0)
    except Exception:
        pwd_ver = 0
    access_token = create_token(
        {
            "sub": str(user.id),
            "user_name": user.user_name,
            "jti": at_jti,
            "pwd_ver": pwd_ver,
        },
        expire=settings.JWT_ACCESS_TIME,
    )
    user = UserResponse.model_validate(user)
    return RefreshResponse(access_token=access_token, user=user)


@router.post("/resend-verify")
async def resend_verify(request: EmailRequest):
    """发送邮件"""
    if await verification.is_rate_limited(request.email):
        raise HTTPException(status_code=429, detail="验证码发送过于频繁，请稍后再试")
    code = verification.generate_code()
    await verification.save_code(request.email, code)
    await email_service.send_verification_email(request.email, code)
    return {"message": "验证邮件成功发送"}


@router.post("/register", summary="用户注册")
async def register(
    user: UserRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    """注册新用户，成功后发送验证邮件。"""
    _, msg = await user_serve.user_register(
        user_name=user.user_name, pwd=user.password, email=user.email
    )
    if msg:
        raise HTTPException(
            status_code=400, detail={"message": msg, "email": user.email}
        )
    code = verification.generate_code()
    await verification.save_code(user.email, code)
    await email_service.send_verification_email(user.email, code)
    return {"message": "邮件已发送", "email": user.email}


@router.post("/verify-email", summary="邮箱验证")
async def verify_email(
    request: VerifyEmailRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    if await verification.is_rate_limited(request.email):
        raise HTTPException(status_code=429, detail="验证尝试过于频繁，请稍后再试")
    verified = await verification.verify_code(request.email, request.code)
    if verified:
        await user_serve.user_repo.update_verified(request.email, True)
        return {"message": "ok"}
    raise HTTPException(status_code=400, detail="验证码无效或已过期")


@router.post("/login", response_model=TokenRes)
async def user_login(
    request: UserLogin, user_serve: Annotated[UserAuthService, Depends(user_db_serve)]
):
    # 登录失败限流：防止暴力破解。按邮箱计数，成功即清零；窗口 15 分钟。
    LOGIN_FAIL_WINDOW = 900  # 15 分钟
    LOGIN_FAIL_MAX = 10
    fail_key = f"auth:login:fail:{request.email.lower()}"
    try:
        fail_count = int(await redis_client.get(fail_key) or 0)
    except Exception:
        fail_count = 0
    if fail_count >= LOGIN_FAIL_MAX:
        raise HTTPException(
            status_code=429, detail="登录失败次数过多，请 15 分钟后再试"
        )

    user, access_token, refresh_token, msg = await user_serve.user_login(
        email=request.email, pwd=request.password
    )
    if msg:
        try:
            pipe = redis_client.pipeline()
            pipe.incr(fail_key)
            pipe.expire(fail_key, LOGIN_FAIL_WINDOW)
            await pipe.execute()
        except Exception as exc:
            logger.warning(f"登录失败计数失败: {exc}")
        status_code = 403 if "邮箱未验证" in msg else 401
        raise HTTPException(status_code=status_code, detail=msg)
    try:
        await redis_client.delete(fail_key)
    except Exception:
        pass
    user = UserResponse.model_validate(user)
    return TokenRes(access_token=access_token, refresh_token=refresh_token, user=user)  # type: ignore
