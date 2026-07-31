from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings
from domains.agent.graphs.graph_lifecycle import compiled_all
from utils.logging import get_logger
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client
from domains.workflow.seed import seed_builtin_workflows
from domains.auth.router import router as auth_router
from domains.user.router import router as user_router
from domains.book.router import router as book_router
from domains.agent.router import router as agent_router
from domains.memory.router import router as memory_router
from domains.workflow.router import router as workflow_router
from domains.knowledge.router import router as knowledge_router
from domains.export.router import router as export_router
from domains.sync.router import router as sync_router
from domains.writing_session.router import router as writing_session_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_application: FastAPI):
    logger.info("应用启动中...")
    await db_manager.init()
    async with db_manager.with_db() as session:
        await seed_builtin_workflows(session)
    await graph_pool_manager.init()
    await compiled_all(checkpointer=graph_pool_manager.checkpoint)
    try:
        await redis_client.ping()
        logger.info("Redis 连接正常")
    except Exception as exc:
        logger.error(f"Redis 连接失败: {exc}")
    logger.info("应用已启动")
    yield
    logger.info("应用关闭中...")
    await db_manager.close()
    await graph_pool_manager.close()
    logger.info("应用已关闭")


app = FastAPI(
    title="Text Forge",
    description="A simple example of a FastAPI application",
    version="0.1.0",
    lifespan=lifespan,
)

if settings.ENV == "production":
    allow_origins = [
        origin.strip()
        for origin in settings.ALLOWED_ORIGINS.split(",")
        if origin.strip()
    ]
else:
    allow_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,  # type: ignore
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(book_router)
api_router.include_router(agent_router)
api_router.include_router(memory_router)
api_router.include_router(workflow_router)
api_router.include_router(knowledge_router)
api_router.include_router(export_router)
api_router.include_router(sync_router)
api_router.include_router(writing_session_router)

app.include_router(api_router)
