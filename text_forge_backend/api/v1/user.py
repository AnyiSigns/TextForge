from typing import Annotated
from fastapi import APIRouter, Depends
from service.user_service import UserAuthService, user_db_serve
from core.auth import get_current
from schema.request.user import ProfileRequest
from schema.response.user import ProfileResponse

router = APIRouter(prefix="/user", tags=["用户"])


@router.put("/profile", response_model=ProfileResponse)
async def user_profile(
    request: ProfileRequest,
    user_serve: Annotated[UserAuthService, Depends(user_db_serve)],
    user_id=Depends(get_current),
):
    await user_serve.user_repo.update(
        user_id,
        user_name=request.user_name,
        email=request.email,
    )
