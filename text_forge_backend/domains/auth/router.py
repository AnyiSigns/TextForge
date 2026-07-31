from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from shared.redis import redis_client
from schema.request.auth import (
    EmailRequest,
    VerifyEmailRequest,
    RefreshRequest,
    UserRequest,
    UserLogin,
)
from schema.response.auth import (
    RefreshResponse,
    TokenRes,
    UserResponse,
)
from .service import user_db_serve, UserAuthService
from config.logging import get_logger
from core.security import verify_token
from .verification import verification
from .email import email_service
import uuid
from core.security import create_token
from config.settings import settings

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/logout")
async def logout(
    request: RefreshRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    payload = verify_token(request.refresh_token)
    user_id = payload.get("sub")
    jti = payload.get("jti")
    user_id = int(user_id)
    await user_serve.token_repo.delete_user_and_jti(user_id, jti)
    return


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
    if not redis_client.sismember(f"refresh_token_{user_id}", request.refresh_token):
        raise HTTPException(status_code=401, detail="令牌不存在")
    at_jti = str(uuid.uuid4())
    access_token = create_token(
        {"sub": str(user.id), "user_name": user.user_name, "jti": at_jti},
        expire=settings.JWT_ACCESS_TIME,
    )
    user = UserResponse.model_validate(user)
    return RefreshResponse(access_token=access_token, user=user)


@router.post("/resend-verify")
async def resend_verify(request: EmailRequest):
    """发送邮件"""
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
    verified = await verification.verify_code(request.email, request.code)
    if verified:
        await user_serve.user_repo.update_verified(request.email, True)
        return {"message": "ok"}
    raise HTTPException(status_code=400, detail="验证码无效或已过期")


@router.post("/login", response_model=TokenRes)
async def user_login(
    request: UserLogin, user_serve: Annotated[UserAuthService, Depends(user_db_serve)]
):
    user, access_token, refresh_token, msg = await user_serve.user_login(
        email=request.email, pwd=request.password
    )
    if msg:
        raise HTTPException(status_code=401, detail=msg)
    user = UserResponse.model_validate(user)
    return TokenRes(access_token=access_token, refresh_token=refresh_token, user=user)  # type: ignore
