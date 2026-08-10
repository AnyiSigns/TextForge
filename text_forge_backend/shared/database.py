from contextlib import asynccontextmanager

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config.logging import get_logger
from config.settings import settings
from models import Base

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
        # scene_events.chapter_id 外键语义统一为「删除章节时级联删除事件」：
        # 早期版本是 SET NULL，与 ORM cascade="all,delete-orphan" 及前端
        # removeChapter/removeVolume 的行为矛盾（ORM 删事件、DB 却置空），
        # 存量库需幂等迁移外键。
        try:
            fks = inspect(sync_conn).get_foreign_keys("scene_events")
            chapter_fk = next(
                (
                    f
                    for f in fks
                    if f.get("constrained_columns") == ["chapter_id"]
                    and f.get("referred_table") == "chapters"
                ),
                None,
            )
            if chapter_fk and chapter_fk.get("options", {}).get("ondelete") != "CASCADE":
                fk_name = chapter_fk["name"]
                sync_conn.exec_driver_sql(
                    f'ALTER TABLE scene_events DROP CONSTRAINT "{fk_name}"'
                )
                sync_conn.exec_driver_sql(
                    "ALTER TABLE scene_events ADD CONSTRAINT scene_events_chapter_id_fkey "
                    "FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE"
                )
                logger.info("已迁移 scene_events.chapter_id 外键为 ON DELETE CASCADE")
        except Exception as e:
            logger.warning(f"scene_events 外键迁移跳过: {e}")
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
    # chapter_contents 版本号唯一约束：存量库 create_all 不会添加新约束，
    # 需幂等补充（并发写入防止重复版本）。
    if "chapter_contents" in tables:
        try:
            constraints = {
                c["name"]
                for c in inspect(sync_conn).get_unique_constraints("chapter_contents")
            }
            if "uq_chapter_contents_chapter_version" not in constraints:
                # 先清理历史重复版本（保留 id 最大的一条），否则建约束会失败
                sync_conn.exec_driver_sql(
                    "DELETE FROM chapter_contents a USING chapter_contents b "
                    "WHERE a.chapter_id = b.chapter_id AND a.version = b.version "
                    "AND a.id < b.id"
                )
                sync_conn.exec_driver_sql(
                    "ALTER TABLE chapter_contents "
                    "ADD CONSTRAINT uq_chapter_contents_chapter_version "
                    "UNIQUE (chapter_id, version)"
                )
                logger.info("已为 chapter_contents 表补充 (chapter_id, version) 唯一约束")
            else:
                logger.debug("chapter_contents 唯一约束已存在，跳过")
        except Exception as e:
            logger.warning(f"chapter_contents 唯一约束补充跳过: {e}")
    # agent_memories.embedding 维度：早期硬编码 Vector(1536)，与用户配置的
    # 任意维度嵌入模型不兼容；迁移为不定维度 vector。
    if "agent_memories" in tables:
        try:
            cols = {c["name"]: c for c in inspect(sync_conn).get_columns("agent_memories")}
            emb_col = cols.get("embedding")
            if emb_col and emb_col.get("type") and "vector(" in str(emb_col["type"]).lower():
                sync_conn.exec_driver_sql(
                    "ALTER TABLE agent_memories ALTER COLUMN embedding TYPE vector"
                )
                logger.info("已迁移 agent_memories.embedding 为不定维度 vector")
        except Exception as e:
            logger.warning(f"agent_memories.embedding 维度迁移跳过: {e}")
    # 热点查询索引：messages 按 (conversation_id, create_at) 取历史消息，
    # 单 conversation_id 索引 + 内存排序在大数据量下退化为排序开销，补复合索引。
    if "messages" in tables:
        try:
            _mcols = {c["name"] for c in inspect(sync_conn).get_columns("messages")}
            # 任务 32：事件卡片消息持久化所需列（type/token）
            for _col, _ddl in (
                ("type", "VARCHAR(32) NOT NULL DEFAULT ''"),
                ("token", "TEXT"),
            ):
                if _col not in _mcols:
                    sync_conn.exec_driver_sql(
                        f"ALTER TABLE messages ADD COLUMN {_col} {_ddl}"
                    )
                    logger.info(f"已为 messages 表补充列 {_col}")
        except Exception as e:
            logger.warning(f"messages 事件卡片列补充跳过: {e}")
        try:
            exists = sync_conn.exec_driver_sql(
                "SELECT 1 FROM pg_indexes WHERE indexname = 'ix_messages_conversation_create'"
            ).fetchone()
            if exists is None:
                sync_conn.exec_driver_sql(
                    "CREATE INDEX ix_messages_conversation_create "
                    "ON messages (conversation_id, create_at)"
                )
                logger.info("已为 messages 表补充 (conversation_id, create_at) 复合索引")
        except Exception as e:
            logger.warning(f"messages 复合索引补充跳过: {e}")


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
            # 连接池大小：Agent 流式回合在整段 LLM 调用期间持有 DB 会话，
            # 单 worker 下过小（原 3）会导致并发回合触溢出。提到 8 并限制溢出为 8，
            # 总连接数受 Postgres max_connections 与 1GiB 内存约束（运维侧设定）。
            pool_size=8,  # 连接池大小
            max_overflow=8  # 连接池最大溢出数
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
