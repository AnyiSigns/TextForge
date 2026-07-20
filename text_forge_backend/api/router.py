from fastapi import APIRouter
from api.v1 import user,chat


router=APIRouter(prefix="/api/v1")

router.include_router(user.router)  #挂载
router.include_router(chat.router)
