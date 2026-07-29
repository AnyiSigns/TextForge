from fastapi import APIRouter
from api.v1 import (
    auth,
    user,
    project,
    health,
    workflow,
    model,
    chat,
    sync,
    characters,
    outline,
    volumes,
    chapters,
    chapter_contents,
    creative_settings,
    knowledge,
    world,
    agent_memory,
    agent,
    writing_sessions,
    export,
)

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(chat.router)
router.include_router(user.router)
router.include_router(project.router)
router.include_router(health.router)
router.include_router(workflow.router)
router.include_router(model.router)
router.include_router(sync.router)
router.include_router(characters.router)
router.include_router(outline.router)
router.include_router(volumes.router)
router.include_router(chapters.router)
router.include_router(chapter_contents.router)
router.include_router(creative_settings.router)
router.include_router(knowledge.router)
router.include_router(world.router)
router.include_router(agent_memory.router)
router.include_router(agent.router)
router.include_router(writing_sessions.router)
router.include_router(export.router)
