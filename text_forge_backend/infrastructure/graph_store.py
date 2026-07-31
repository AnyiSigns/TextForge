from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from config.settings import settings
from utils.logger import get_logger



logger = get_logger(__name__)

class GraphPoolManager:
    def __init__(self):
        self.graph_pool=AsyncConnectionPool(
            conninfo=settings.POSTGRES_GRAPH_URL,
            min_size=3,  # 连接池最小大小
            max_size=5,  # 连接池最大大小
            open=False  # 是否立即打开连接池
        )
        self.checkpoint=None

    async def init(self):
        try:
            async with AsyncPostgresSaver.from_conn_string(settings.POSTGRES_GRAPH_URL) as saver:
                await saver.setup()
                logger.info("表创建成功(Graph)")
            await self.graph_pool.open()
            logger.info("Graph连接池已打开")
            self.checkpoint = AsyncPostgresSaver(self.graph_pool)  # type: ignore
            logger.info("Graph检查点已初始化")
        except Exception as e:
            logger.error(f"初始化Graph连接池异常: {e}")

    async def close(self):
        await self.graph_pool.close()
        logger.info("Graph连接池已关闭")

graph_pool_manager = GraphPoolManager()

