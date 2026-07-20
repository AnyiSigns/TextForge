from fastapi import APIRouter
from api.v1 import user,chat


router=APIRouter(prefix="/api/")

router.include_router(user.router,prefix="/user")  #挂载用户认证路由
router.include_router(chat.router,prefix="/chat")  #挂载对话路由
