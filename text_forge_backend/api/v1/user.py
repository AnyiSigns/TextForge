from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from config.redis_config import redis_client as redis
from schema.request.user import EmailRequest, VerifyEmailRequest, UserRequest, UserLogin
from schema.response.user import TokenRes, UserResponse
from service.user_service import user_db_serve, UserAuthService
from utils import get_logger
from core.auth import get_current
from service.verification_service import verifacation
from service.email_service import email_service

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/refresh")
async def refresh_at():
    pass


@router.post("/resend-verify")
async def resend_verify(request: EmailRequest):
    """重发邮件"""
    code = verifacation.generate_code()
    await verifacation.save_code(request.email, code)
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
    code = verifacation.generate_code()
    await verifacation.save_code(user.email, code)
    await email_service.send_verification_email(user.email, code)
    return {"message": "邮件已发送", "email": user.email}


@router.post("/verify-email", summary="邮箱验证")
async def verify_email(
    request: VerifyEmailRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    verified = await verifacation.verify_code(request.email, request.code)
    if verified:
        await user_serve.user_repo.updata_verified(request.email, True)
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
