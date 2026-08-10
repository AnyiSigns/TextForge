import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config.logging import get_logger, request_id_var
from config.settings import settings
from domains.agent.router import router as agent_router
from domains.auth.router import router as auth_router
from domains.auth.user_router import router as user_router
from domains.book.chapter_content_router import router as chapter_content_router
from domains.book.chapter_router import router as chapter_router
from domains.book.character_router import router as character_router
from domains.book.creative_settings_router import router as creative_settings_router
from domains.book.export_router import router as export_router
from domains.book.router import router as book_router
from domains.book.volume_router import router as volume_router
from domains.knowledge.router import router as knowledge_router
from domains.lock.router import router as lock_router
from domains.memory.router import router as memory_router
from domains.model.router import router as model_router
from domains.sim_rooms.router import router as sim_rooms_router
from domains.story_flow.router import router as story_flow_router
from domains.system.health_router import router as health_router
from domains.system.sync_router import router as sync_router
from domains.wizard.router import router as wizard_router
from domains.workflow.router import router as workflow_router
from domains.workflow.seed import seed_builtin_workflows
from domains.world.router import router as world_router
from domains.writing_session.router import router as writing_session_router
from shared.database import db_manager
from shared.graph_store import graph_pool_manager
from shared.redis import redis_client

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_application: FastAPI):
    logger.info("应用启动中...")
    await db_manager.init()
    async with db_manager.with_db() as session:
        await seed_builtin_workflows(session)
    await graph_pool_manager.init()
    try:
        await redis_client.ping()
        logger.info("Redis 连接正常")
        # 清理进程重启/崩溃残留的 Agent 书籍锁，避免新会话被误判为「书籍正在进行任务」
        removed = 0
        async for key in redis_client.scan_iter("agent:book_lock:*"):
            await redis_client.delete(key)
            removed += 1
        if removed:
            logger.warning(f"已清理 {removed} 个残留的 Agent 书籍锁")
    except Exception as exc:
        logger.error(f"Redis 连接失败: {exc}")
    logger.info("应用已启动")
    yield
    logger.info("应用关闭中...")
    # 优雅关闭：取消在途 Agent 流式任务，触发其 finally 释放书籍锁与资源，
    # 避免进程退出时锁残留到 TTL（10 分钟）。
    try:
        from domains.agent.router import _stream_tasks

        for _task in list(_stream_tasks.values()):
            if not _task.done():
                _task.cancel()
    except Exception as exc:
        logger.warning(f"取消在途流式任务失败: {exc}")
    await db_manager.close()
    await graph_pool_manager.close()
    logger.info("应用已关闭")


app = FastAPI(
    title="Text Forge",
    description="AI-powered creative writing platform",
    version="0.1.0",
    lifespan=lifespan,
)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """注入/透传 X-Request-ID 到日志上下文，并记录请求耗时（含 SSE 流式总时长）。"""

    async def dispatch(self, request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        token = request_id_var.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        logger.info(
            f"{request.method} {request.url.path} -> {response.status_code} ({elapsed_ms:.0f}ms)"
        )
        return response

if settings.ENV == "production":
    allow_origins = [
        origin.strip()
        for origin in settings.ALLOWED_ORIGINS.split(",")
        if origin.strip()
    ]
else:
    allow_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,  # type: ignore
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求上下文中间件：需在 CORS 之后注册，使 request_id 贯穿所有请求处理
app.add_middleware(RequestContextMiddleware)


@app.get("/")
def read_root():
    return {"Hello": "World"}


app.include_router(model_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(book_router, prefix="/api")
app.include_router(volume_router, prefix="/api")
app.include_router(chapter_router, prefix="/api")
app.include_router(chapter_content_router, prefix="/api")
app.include_router(character_router, prefix="/api")
app.include_router(creative_settings_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(memory_router, prefix="/api")
app.include_router(workflow_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(world_router, prefix="/api")
app.include_router(wizard_router, prefix="/api")
app.include_router(writing_session_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(sync_router, prefix="/api")
app.include_router(lock_router, prefix="/api")
app.include_router(sim_rooms_router, prefix="/api")
app.include_router(story_flow_router, prefix="/api")
