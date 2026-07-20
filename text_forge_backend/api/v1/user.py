from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from schema.request.user import UserRequest, UserLogin
from schema.response.user import UserRes, TokenRes
from service.user_service import user_db_serve,UserAuthService
from utils import get_logger
from core.auth import get_current



logger = get_logger(__name__)
router=APIRouter(prefix="/user/auth/",tags=["认证"])

@router.post("/register",response_model=UserRes,summary="用户注册")
async def register(
        user: UserRequest,
        user_serve:Annotated[UserAuthService,Depends(user_db_serve)]
):
    """注册新用户，返回用户信息（不含密码）。"""



@router.post("/login",response_model=TokenRes,summary="用户登录",description="使用用户名/邮箱 + 密码登录，返回 JWT access_token。",responses={401:{'description':'用户名或密码错误',},})
async def login(
        user: UserLogin,
        user_serve:Annotated[UserAuthService,Depends(user_db_serve)]
):
    """用户登录，成功后返回 access_token，需在后续请求的 Authorization: Bearer <token> 中使用。"""
    token,error=await user_serve.user_login(
        user_name=user.user_name,
        pwd=user.password
    )
    if error:
        raise HTTPException(status_code=401,detail=error)
    return TokenRes(access_token=token)

@router.get("/info",response_model=UserRes,summary="获取当前用户信息",description="获取当前登录用户的基本信息，需要携带有效的 JWT token。")
async def get_user_info(
        current_user=Depends(get_current),
):
    """获取当前登录用户信息"""
    logger.info("获取用户信息")
    return UserRes.model_validate(current_user)







