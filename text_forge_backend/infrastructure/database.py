from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from config.settings import settings
from model import Base
from utils.logger import get_logger



logger = get_logger(__name__)

class DBManager:
    def __init__(self):
        self.async_engine=create_async_engine(
            url=settings.POSTGRES_DB_URL,
            echo=True,  #开启日志
            pool_pre_ping=True, #开启连接预检查
            pool_size=3,  #连接池大小
            max_overflow=10  #连接池最大溢出数
        )
        self.session_factory=async_sessionmaker(
            bind=self.async_engine,  # 绑定异步引擎
            class_=AsyncSession,  # 会话类: AsyncSession
            expire_on_commit=False,  # 提交后不会过期
            autocommit=False,  # 禁用自动提交
            autoflush=False  # 禁用自动刷新
        )

    async def get_db(self):
        async with self.session_factory() as session:
            try:
                yield session
            except RequestValidationError:
                await session.rollback()
                logger.warning("数据已回滚")
                raise
            except HTTPException:
                await session.rollback()
                logger.warning("数据已回滚")
                raise
            except Exception as e:
                await session.rollback()
                logger.error(f"数据库操作失败*{e}*")
                raise

    async def init(self):
        try:
            async with self.async_engine.begin() as conn:
                if settings.AUTO_CREATE_TABLES:
                    await conn.run_sync(Base.metadata.create_all)   #type:ignore
                    logger.info("数据库表已创建/存在")
        except Exception as e:
            logger.error(f"数据库连接失败{e}")

    async def close(self):
        await self.async_engine.dispose()
        logger.info("数据库连接已关闭")

db_manager = DBManager()

