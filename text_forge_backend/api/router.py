from fastapi import APIRouter
from api.v1 import chat
from api.v1 import auth, user, project, health, workflow

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(chat.router)
router.include_router(user.router)
router.include_router(project.router)
router.include_router(health.router)
router.include_router(workflow.router)
