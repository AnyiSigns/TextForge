from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from agents.graphs.graph_lifecycle import compiled_all
from utils import get_logger
from infrastructure.database import db_manager
from infrastructure.graph_store import graph_pool_manager
from api.router import router
from service.workflow_seed import seed_builtin_workflows

# 日志初始化
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
    allow_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
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


app.include_router(router)
