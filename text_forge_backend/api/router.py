from fastapi import APIRouter
from api.v1 import chat
from api.v1 import auth

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(chat.router)
