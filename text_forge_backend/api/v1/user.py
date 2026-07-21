from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from service.user_service import UserAuthService, user_db_serve
from core.auth import get_current
from schema.request.user import ChangePasswordReq, ChangePasswordByEmailReq, ProfileRequest
from schema.response.user import ProfileResponse
from service.verification_service import verifacation

router = APIRouter(prefix="/user", tags=["用户"])


@router.put("/profile", response_model=ProfileResponse)
async def user_profile(
    request: ProfileRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
    user_id=Depends(get_current),
):
    user = await user_serve.user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    is_email_changed = request.email != user.email
    if is_email_changed:
        if not request.code:
            raise HTTPException(status_code=400, detail="改邮箱需提供验证码")
        verified = await verifacation.verify_code(user.email, request.code)
        if not verified:
            raise HTTPException(status_code=400, detail="验证码无效或已过期")

    update_data = {}
    if request.user_name != user.user_name:
        update_data["user_name"] = request.user_name
    if is_email_changed:
        update_data["email"] = request.email

    if update_data:
        updated = await user_serve.user_repo.update(user_id, **update_data)
        if updated:
            user = updated

    return ProfileResponse(user=user)


@router.post("/change-password")
async def update_change_pwd(
    password: ChangePasswordReq,
    user_id: Annotated[int, Depends(get_current)],
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    try:
        await user_serve.old_new_password(
            password.old_password, password.new_password, user_id
        )
        return {"message": "密码修改成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/change-password-by-email")
async def update_change_pwd_by_email(
    request: ChangePasswordByEmailReq,
    user_id: Annotated[int, Depends(get_current)],
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
):
    user = await user_serve.user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    try:
        await user_serve.change_password_by_email(
            user.email, request.code, request.new_password
        )
        return {"message": "密码修改成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
