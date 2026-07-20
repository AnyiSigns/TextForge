from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from schema.request.user import UserRequest, UserLogin
from schema.response.user import UserRes, TokenRes
from service.user_service import user_db_serve,UserAuthService
from utils import get_logger
from core.auth import get_current



logger = get_logger(__name__)
router=APIRouter(prefix="/user",tags=["认证"])

@router.post("/register",response_model=UserRes)
async def register(
        user: UserRequest,
        user_serve:Annotated[UserAuthService,Depends(user_db_serve)]
):
    """用户注册"""
    logger.info("开始注册用户")
    user_res,error=await user_serve.user_register(
        user_name=user.user_name,
        pwd=user.password,
        email=user.email,
        phone=user.phone
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    logger.info("注册用户成功")
    return UserRes.model_validate(user_res)

@router.post("/login",response_model=TokenRes)
async def login(
        user: UserLogin,
        user_serve:Annotated[UserAuthService,Depends(user_db_serve)]
):
    """用户登录"""
    token,error=await user_serve.user_login(
        user_name=user.user_name,
        pwd=user.password
    )
    if error:
        raise HTTPException(status_code=401,detail=error)
    return TokenRes(access_token=token)

@router.get("/info",response_model=UserRes)
async def get_user_info(
        current_user=Depends(get_current),
):
    """获取用户信息"""
    logger.info("获取用户信息")
    return UserRes.model_validate(current_user)







