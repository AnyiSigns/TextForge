from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.outline_repo import OutlineRepository
from repository.project_repo import BookRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class OutlineService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.outline_repo = OutlineRepository(session)
        self.book_repo = BookRepository(session)

    async def list_outlines(self, book_id: int):
        try:
            return await self.outline_repo.list_outlines(book_id)
        except Exception:
            logger.error("获取大纲列表失败", exc_info=True)
            return []

    async def get_outline(self, book_id: int, outline_id: int):
        try:
            return await self.outline_repo.book_outline_detail(book_id, outline_id)
        except Exception:
            logger.error("获取大纲失败", exc_info=True)
            return None

    async def create_outline(self, book_id: int, **data):
        try:
            return await self.outline_repo.create_outline(book_id, data)
        except Exception:
            logger.error("创建大纲失败", exc_info=True)
            return None

    async def update_outline(self, outline_id: int, **data):
        try:
            return await self.outline_repo.update_outline(outline_id, **data)
        except Exception:
            logger.error("更新大纲失败", exc_info=True)
            return None

    async def delete_outline(self, outline_id: int):
        try:
            return await self.outline_repo.delete_outline(outline_id)
        except Exception:
            logger.error("删除大纲失败", exc_info=True)
            return False

    async def auto_summarize_if_needed(self, outline_id: int, book_id: int, user_id: int, data: dict):
        try:
            from repository.model_repo import ModelConfRepository
            from model.model import ModelConfig
            from core.model_factory import ModelFactory
            from langchain_core.messages import SystemMessage, HumanMessage

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
    return OutlineService(db)

