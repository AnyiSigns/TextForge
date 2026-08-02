import os
import uuid
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from schema.request.user import (
    ChangePasswordByEmailReq,
    ChangePasswordReq,
    ProfileRequest,
    SendCodeRequest,
)
from schema.response.user import ProfileResponse

from .service import UserAuthService, user_db_serve
from .verification import verification

logger = get_logger(__name__)

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
        verified = await verification.verify_code(user.email, request.code)
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
            await user_serve.session.commit()
            await user_serve.session.refresh(updated)
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
        logger.error(f"密码修改失败: {e}")
        raise HTTPException(status_code=400, detail="密码修改失败")


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
        logger.error(f"邮箱换密码失败: {e}")
        raise HTTPException(status_code=400, detail="修改失败")


@router.post("/send-code")
async def send_verification_code(
    user_id: Annotated[int, Depends(get_current)],
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
    body: SendCodeRequest,
):
    user = await user_serve.user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    target_email = body.email if body.email else user.email
    code = verification.generate_code()
    await verification.save_code(target_email, code)

    from .email import email_service

    ok = await email_service.send_verification_email(target_email, code)
    if ok:
        return {"message": f"验证码已发送至 {target_email}"}
    raise HTTPException(status_code=500, detail="验证码发送失败，请检查邮件服务器配置")


@router.post("/avatar")
async def upload_avatar(
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
    file: UploadFile = File(...),
    user_id=Depends(get_current),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        ext = ".png"

    filename = f"{user_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "static",
        "avatars",
    )
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    avatar_url = f"/static/avatars/{filename}"
    await user_serve.user_repo.update(user_id, avatar=avatar_url)
    await user_serve.session.commit()
    return {"avatar_url": avatar_url}
