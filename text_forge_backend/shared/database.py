from contextlib import asynccontextmanager

from config.logging import get_logger
from config.settings import settings
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from models import Base
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = get_logger(__name__)


def _sync_missing_columns(sync_conn):
    """为存量表补充新模型引入、但 create_all 不会添加到已有表的列（幂等）。

    项目未引入 Alembic，启动时对已知增量列做轻量对齐，避免存量库
    首次访问新列时报 column does not exist。
    """
    try:
        tables = set(inspect(sync_conn).get_table_names())
    except Exception as e:
        logger.warning(f"数据库 schema 检查跳过: {e}")
        return
    if "scene_events" in tables:
        existing = {c["name"] for c in inspect(sync_conn).get_columns("scene_events")}
        for col_name, col_ddl in (
            ("resolved_foreshadowing_ids", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
            ("completed_plot_thread_ids", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ):
            if col_name not in existing:
                sync_conn.exec_driver_sql(
                    f"ALTER TABLE scene_events ADD COLUMN {col_name} {col_ddl}"
                )
                logger.info(f"已为 scene_events 表补充列 {col_name}")
    if "sim_branches" in tables:
        existing = {c["name"] for c in inspect(sync_conn).get_columns("sim_branches")}
        for col_name, col_ddl in (
            ("related_event_ids", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
            ("related_foreshadowing_ids", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
            ("related_plot_thread_ids", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ):
            if col_name not in existing:
                sync_conn.exec_driver_sql(
                    f"ALTER TABLE sim_branches ADD COLUMN {col_name} {col_ddl}"
                )
                logger.info(f"已为 sim_branches 表补充列 {col_name}")


class DBManager:
    """数据库会话管理器。

    基于 SQLAlchemy 2.x 异步引擎，提供 FastAPI 依赖注入与会话生命周期管理。
    """

    def __init__(self):
        """初始化 DBManager，创建异步引擎与会话工厂。"""
        self.async_engine = create_async_engine(
            url=settings.POSTGRES_DB_URL,
            # echo 由 SQL_ECHO 显式控制，默认关闭，避免 SQL 日志淹没业务日志
            echo=settings.SQL_ECHO,
            pool_pre_ping=True,  # 开启连接预检查
            pool_size=3,  # 连接池大小
            max_overflow=10  # 连接池最大溢出数
        )
        self.session_factory = async_sessionmaker(
            bind=self.async_engine,  # 绑定异步引擎
            class_=AsyncSession,  # 会话类: AsyncSession
            expire_on_commit=False,  # 提交后不会过期
            autocommit=False,  # 禁用自动提交
            autoflush=False  # 禁用自动刷新
        )

    async def get_db(self):
        """FastAPI 依赖：提供异步数据库会话。

        Yields:
            AsyncSession 实例。
        """
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

    @asynccontextmanager
    async def with_db(self):
        """上下文管理器：提供异步数据库会话。

        Yields:
            AsyncSession 实例。
        """
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
        """初始化数据库连接，根据配置自动建表。"""
        try:
            async with self.async_engine.begin() as conn:
                if settings.AUTO_CREATE_TABLES:
                    await conn.run_sync(Base.metadata.create_all)   #type: ignore
                    logger.info("数据库表已创建/存在")
                # 轻量 schema 对齐：补充存量表新增的列（create_all 不会 ALTER 已有表）。
                # 独立于 AUTO_CREATE_TABLES：即使生产环境关闭自动建表，存量库也需补充新增列。
                await conn.run_sync(_sync_missing_columns)
        except Exception as e:
            logger.error(f"数据库连接失败{e}")

    async def close(self):
        """关闭数据库连接池。"""
        await self.async_engine.dispose()
        logger.info("数据库连接已关闭")

db_manager = DBManager()
