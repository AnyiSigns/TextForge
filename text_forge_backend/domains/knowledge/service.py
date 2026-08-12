
from sqlalchemy import delete as sqla_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.model_factory import ModelFactory
from models.document import Document
from shared.redis import delete_rag_cache

from .repository import VectorRepository

logger = get_logger(__name__)


class KnowledgeService:
    """知识库服务层。

    提供公共知识库检索、文档上传与列表查询。
    """

    def __init__(self, session: AsyncSession):
        """初始化 KnowledgeService。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session

    async def search_public(
        self, query: str, top_k: int = 3, model_config: dict | None = None
    ) -> list[dict]:
        """公共知识库语义检索。

        Args:
            query: 检索查询文本。
            top_k: 返回结果数。
            model_config: 模型配置，用于生成 embedding。

        Returns:
            检索结果列表，每个元素包含 content、distance 等字段。

        Raises:
            ValueError: 未配置 embedding 模型或 embedding 生成失败时抛出，
                附带具体原因，由上层转为用户可见错误信息。
        """
        if not query.strip():
            return []

        embedding = None
        if model_config:
            try:
                llm = ModelFactory(model_config)
                embedding = await llm.embedding.aembed_query(query)
            except Exception as exc:
                logger.warning(f"知识库检索 embedding 失败: {exc}")
                raise ValueError(
                    f"知识库检索 embedding 生成失败（{type(exc).__name__}: {exc}），"
                    "请检查模型配置中的 embedding 模型设置"
                ) from exc

        if embedding is None or not embedding:
            raise ValueError("知识库语义检索需要 embedding 模型，请在模型配置中启用后再搜索")

        vector_repo = VectorRepository(self.session)
        items = await vector_repo.search_external_books(
            query_embedding=embedding,
            rag_filter={"query": query},
            top_k=top_k,
        )
        return items

    async def upload_public(self, file, emb_config: dict | None = None):
        """上传公共知识库文档。

        Args:
            file: 上传文件对象。
            emb_config: embedding 配置。

        Returns:
            上传处理结果。
        """
        from domains.book.upload_repository import process_upload

        return await process_upload(self.session, file, emb_config=emb_config)

    async def list_public(self, page: int = 1, page_size: int = 20):
        """分页查询公共知识库文档列表。

        Args:
            page: 页码，从 1 开始。
            page_size: 每页数量。

        Returns:
            文档实例列表。
        """
        stmt = select(Document).where(Document.scope == "public").order_by(Document.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_public(self, doc_id: int):
        """获取单个公共知识库文档。

        Args:
            doc_id: 文档 ID。

        Returns:
            Document 实例，不存在返回 None。
        """
        stmt = select(Document).where(Document.id == doc_id, Document.scope == "public")
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_public(self, doc_id: int):
        """删除公共知识库文档。

        Args:
            doc_id: 文档 ID。
        """
        stmt = sqla_delete(Document).where(Document.id == doc_id, Document.scope == "public")
        await self.session.execute(stmt)
        await self.session.commit()
        await delete_rag_cache("rag:*")