from core.exceptions import AppException
from fastapi import Depends
from shared.database import db_manager
from .outline_repository import OutlineRepository
from .repository import BookRepository
from sqlalchemy.ext.asyncio import AsyncSession
from config.logging import get_logger

logger = get_logger(__name__)


class OutlineService:
    """大纲业务逻辑服务。

    提供大纲 CRUD 与自动摘要能力。
    """

    def __init__(self, session: AsyncSession):
        """初始化 OutlineService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        self.outline_repo = OutlineRepository(session)
        self.book_repo = BookRepository(session)

    async def list_outlines(self, book_id: int):
        """查询书籍大纲列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            大纲实例列表。
        """
        try:
            return await self.outline_repo.list_outlines(book_id)
        except Exception:
            logger.error("获取大纲列表失败", exc_info=True)
            raise AppException(status_code=500, detail="获取大纲列表失败", error_code="LIST_OUTLINES_FAILED")

    async def get_outline(self, book_id: int, outline_id: int):
        """查询单个大纲。

        Args:
            book_id: 书籍 ID。
            outline_id: 大纲 ID。

        Returns:
            大纲实例。

        Raises:
            AppException: 大纲不存在时抛出 404。
        """
        try:
            result = await self.outline_repo.book_outline_detail(book_id, outline_id)
            if not result:
                raise AppException(status_code=404, detail="大纲不存在", error_code="OUTLINE_NOT_FOUND")
            return result
        except AppException:
            raise
        except Exception:
            logger.error("获取大纲失败", exc_info=True)
            raise AppException(status_code=500, detail="获取大纲失败", error_code="GET_OUTLINE_FAILED")

    async def create_outline(self, book_id: int, **data):
        """创建大纲。

        Args:
            book_id: 书籍 ID。
            **data: 大纲字段。

        Returns:
            新创建的大纲实例，失败返回 None。
        """
        try:
            instance = await self.outline_repo.create_outline(book_id, data)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except Exception:
            logger.error("创建大纲失败", exc_info=True)
            return None

    async def update_outline(self, outline_id: int, **data):
        """更新大纲。

        Args:
            outline_id: 大纲 ID。
            **data: 要更新的字段。

        Returns:
            更新后的大纲实例。

        Raises:
            AppException: 大纲不存在时抛出 404。
        """
        try:
            instance = await self.outline_repo.get(outline_id)
            if not instance:
                raise AppException(status_code=404, detail="大纲不存在", error_code="OUTLINE_NOT_FOUND")
            for key, value in data.items():
                if value is not None:
                    setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except AppException:
            raise
        except Exception:
            logger.error("更新大纲失败", exc_info=True)
            raise AppException(status_code=500, detail="更新大纲失败", error_code="UPDATE_OUTLINE_FAILED")

    async def delete_outline(self, outline_id: int):
        """删除大纲。

        Args:
            outline_id: 大纲 ID。

        Returns:
            删除成功返回 True，否则返回 False。
        """
        try:
            instance = await self.outline_repo.get(outline_id)
            if not instance:
                raise AppException(status_code=404, detail="大纲不存在", error_code="OUTLINE_NOT_FOUND")
            await self.outline_repo.delete_outline(outline_id)
            return True
        except AppException:
            raise
        except Exception:
            logger.error("删除大纲失败", exc_info=True)
            raise AppException(status_code=500, detail="删除大纲失败", error_code="DELETE_OUTLINE_FAILED")

    async def auto_summarize_if_needed(self, outline_id: int, book_id: int, user_id: int, data: dict):
        """若章节缺少摘要，自动调用模型生成摘要并回写。

        Args:
            outline_id: 大纲 ID。
            book_id: 书籍 ID。
            user_id: 用户 ID。
            data: 大纲数据。
        """
        try:
            from core.model_factory import ModelFactory
            from langchain_core.messages import HumanMessage, SystemMessage
            from domains.model.repository import ModelConfRepository

            book = await self.book_repo.get(book_id)
            if not book:
                return

            volumes = data if isinstance(data, list) else data.get("data", [])
            target = None
            for vol in volumes:
                for ch in vol.get("chapters", []):
                    if ch.get("content") and not ch.get("summary"):
                        target = ch
                        break
                if target:
                    break

            if not target:
                return

            model_conf = await ModelConfRepository(self.session).query_user_model(user_id)
            if not model_conf:
                return

            cfg = {
                "user_id": model_conf.user_id,
                "main_config": model_conf.main_config or {},
                "audit_config": model_conf.audit_config or {},
                "router_config": model_conf.router_config or {},
                "tool_config": model_conf.tool_config or {},
                "vision_config": model_conf.vision_config or {},
                "embedding_config": model_conf.embedding_config or {},
            }
            llm = ModelFactory(cfg)
            prompt = (
                "请用2-3句话概括以下章节内容，保留关键情节和核心信息，语言简洁。\n\n章节标题："
                + str(target.get("title", ""))
                + "\n正文:"
                + str(target.get("content", ""))
            )
            res = await llm.main.ainvoke([SystemMessage("你是章节摘要助手"), HumanMessage(prompt)])
            target["summary"] = res.content.strip()
            await self.outline_repo.update_outline(outline_id, data=volumes)
        except Exception:
            logger.error("自动生成摘要失败", exc_info=True)


async def outline_db(db: AsyncSession = Depends(db_manager.get_db)):
    """FastAPI 依赖注入：提供 OutlineService 实例。"""
    return OutlineService(db)
