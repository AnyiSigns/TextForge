import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from config.logging import get_logger
from config.settings import settings
from core.exceptions import AppException
from core.security import create_token, verify_token
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

# refresh token 以 HttpOnly cookie 下发（XSS 不可读），前端仅保留同名的
# 非敏感登录标志 cookie（tf_logged_in）供 middleware/proxy 判断登录态。
REFRESH_COOKIE = "tf_rt"
_REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 与 JWT refresh 有效期一致（7 天）


def _set_refresh_cookie(response: Response, token: str) -> None:
    """下发 HttpOnly refresh cookie：仅可被后端读取，防 XSS 窃取长期凭据。"""
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=_REFRESH_COOKIE_MAX_AGE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "production",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/")


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    raw_req: Request,
    response: Response,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    """登出：删除 refresh token，并将 access token 加入黑名单立即失效。"""
    # HttpOnly cookie 优先（前端不再传 refresh_token body）；body 兼容旧客户端/测试
    refresh_token = raw_req.cookies.get(REFRESH_COOKIE) or body.refresh_token
    _clear_refresh_cookie(response)
    payload = verify_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效")
    user_id = int(payload.get("sub"))
    jti = payload.get("jti")
    await user_serve.token_repo.delete_user_and_jti(user_id, jti)
    await redis_client.srem(f"refresh_token_{user_id}", refresh_token)
    # access token 黑名单：jti → 黑名单，TTL 取 access 剩余有效期（默认 15 分钟）
    access_token = body.access_token
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
    body: RefreshRequest,
    raw_req: Request,
    response: Response,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    # HttpOnly cookie 优先；body 兼容旧客户端/测试
    refresh_token = raw_req.cookies.get(REFRESH_COOKIE) or body.refresh_token
    payload = verify_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效")
    user_id = int(payload.get("sub"))
    rt_jti = payload.get("jti")
    user = await user_serve.user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    user_token = await user_serve.token_repo.get_by_user_and_jti(rt_jti, user.id)
    if not user_token:
        raise HTTPException(status_code=401, detail="用户/令牌不存在")
    if not await redis_client.sismember(
        f"refresh_token_{user_id}", refresh_token
    ):
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
    user_resp = UserResponse.model_validate(user)
    # 刷新成功：滑动续期 HttpOnly refresh cookie
    _set_refresh_cookie(response, refresh_token)
    return RefreshResponse(access_token=access_token, user=user_resp)


@router.post("/resend-verify")
async def resend_verify(
    request: EmailRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    """重新发送验证邮件（仅限已注册未验证的邮箱，防止对任意邮箱轰炸）。"""
    user = await user_serve.user_repo.query_user_email(request.email)
    if not user:
        raise HTTPException(status_code=400, detail="验证邮件发送失败或邮箱未注册，请检查邮箱地址")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="该邮箱已验证，无需重复验证")
    if await verification.is_rate_limited(request.email):
        raise HTTPException(status_code=429, detail="验证码发送过于频繁，请稍后再试")
    code = verification.generate_code()
    await verification.save_code(request.email, code, "verify_email")
    sent = await email_service.send_verification_email(request.email, code)
    if not sent:
        raise HTTPException(status_code=502, detail="验证邮件发送失败，请稍后再试")
    return {"message": "验证邮件成功发送"}


@router.post("/register", summary="用户注册")
async def register(
    user: UserRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    """注册新用户，成功后发送验证邮件。"""
    if await verification.is_rate_limited(user.email):
        raise HTTPException(status_code=429, detail="验证码发送过于频繁，请稍后再试")
    _, msg = await user_serve.user_register(
        user_name=user.user_name, pwd=user.password, email=user.email
    )
    if msg:
        raise HTTPException(
            status_code=400, detail={"message": msg, "email": user.email}
        )
    code = verification.generate_code()
    await verification.save_code(user.email, code, "verify_email")
    sent = await email_service.send_verification_email(user.email, code)
    # 账号已创建但邮件发送失败时仍返回成功并标明 email_sent=false，
    # 前端据此提示用户进入验证页手动重发，避免用户被误导为「邮件已发出」。
    return {
        "message": "邮件已发送" if sent else "注册成功，但验证邮件发送失败",
        "email": user.email,
        "email_sent": sent,
    }


@router.post("/verify-email", summary="邮箱验证")
async def verify_email(
    request: VerifyEmailRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    if await verification.is_rate_limited(request.email):
        raise HTTPException(status_code=429, detail="验证尝试过于频繁，请稍后再试")
    verified = await verification.verify_code(request.email, request.code, "verify_email")
    if verified:
        user = await user_serve.user_repo.query_user_email(request.email)
        if not user:
            raise HTTPException(status_code=404, detail="该邮箱尚未注册")
        await user_serve.user_repo.update_verified(request.email, True)
        return {"message": "ok"}
    raise HTTPException(status_code=400, detail="验证码无效或已过期")


@router.post("/login", response_model=TokenRes)
async def user_login(
    body: UserLogin,
    response: Response,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    # 登录失败限流：防止暴力破解。按邮箱计数，成功即清零；窗口 15 分钟。
    LOGIN_FAIL_WINDOW = 900  # 15 分钟
    LOGIN_FAIL_MAX = 10
    fail_key = f"auth:login:fail:{body.email.lower()}"
    try:
        fail_count = int(await redis_client.get(fail_key) or 0)
    except Exception:
        fail_count = 0
    if fail_count >= LOGIN_FAIL_MAX:
        raise HTTPException(
            status_code=429, detail="登录失败次数过多，请 15 分钟后再试"
        )

    user, access_token, refresh_token, msg = await user_serve.user_login(
        email=body.email, pwd=body.password
    )
    if msg:
        try:
            pipe = redis_client.pipeline()
            pipe.incr(fail_key)
            pipe.expire(fail_key, LOGIN_FAIL_WINDOW)
            await pipe.execute()
        except Exception as exc:
            logger.warning(f"登录失败计数失败: {exc}")
        # 结构化错误码优先：前端按 code 分支，避免耦合 detail 文案。
        # 状态码统一 401（凭据无效），避免 403/401 差异泄露账号注册与验证状态
        # （账号枚举）；EMAIL_NOT_VERIFIED 仅通过响应体 error_code 传递。
        if "邮箱未验证" in msg:
            raise AppException(401, msg, "EMAIL_NOT_VERIFIED")
        raise HTTPException(status_code=401, detail=msg)
    try:
        await redis_client.delete(fail_key)
    except Exception:
        pass
    user_resp = UserResponse.model_validate(user)
    _set_refresh_cookie(response, refresh_token)
    return TokenRes(access_token=access_token, user=user_resp)
