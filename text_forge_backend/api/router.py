from fastapi import APIRouter
from api.v1 import user, chat

router = APIRouter(prefix="/api")
router.include_router(user.router)
router.include_router(chat.router)
