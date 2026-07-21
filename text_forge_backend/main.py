from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.graph_lifecycle import compiled_all
from utils import get_logger
from infrastructure.database import db_manager
from infrastructure.graph_store import graph_pool_manager
from api.router import router
from config.settings import settings

# 日志初始化
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_application: FastAPI):
    logger.info("应用启动中...")
    await db_manager.init()
    await graph_pool_manager.init()
    await compiled_all(checkpointer=graph_pool_manager.checkpoint)
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

app.add_middleware(
    CORSMiddleware,  # type: ignore
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


app.include_router(router)
