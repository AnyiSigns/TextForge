import time

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
            ValueError: embedding 配置存在但生成失败时抛出，附带具体原因，
                由上层转为用户可见错误信息；未配置 embedding 时回退全文检索，不抛错。
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

        vector_repo = VectorRepository(self.session)
        rag_filter = {"query": query}
        _t0 = time.monotonic()
        if embedding:
            items = await vector_repo.search_external_books(
                query_embedding=embedding,
                rag_filter=rag_filter,
                top_k=top_k,
            )
        else:
            # 无 embedding 配置或生成空向量 → 回退全文检索
            # （决策 embedding_config_empty_fallback_fulltext：前端未携带 embedding
            # 配置时走 fulltext 分支，不做语义检索）。
            items = await vector_repo.search_external_books_fulltext(
                query=query,
                rag_filter=rag_filter,
                top_k=top_k,
            )
        _elapsed_ms = round((time.monotonic() - _t0) * 1000, 1)
        logger.debug(
            "公共知识库检索 query=%r top_k=%s 命中=%s 耗时=%sms mode=%s",
            query[:20],
            top_k,
            len(items),
            _elapsed_ms,
            "vector" if embedding else "fulltext",
        )
        return items

    async def upload_public(
        self, file, user_id: int, emb_config: dict | None = None
    ):
        """上传公共知识库文档。

        Args:
            file: 上传文件对象。
            user_id: 当前用户 ID，用于补全文档作者（author = 用户名）。
            emb_config: embedding 配置。

        Returns:
            上传处理结果。
        """
        from domains.book.upload_repository import process_upload

        result = await process_upload(self.session, file, user_id=user_id, emb_config=emb_config)
        # P1-10 补全 author 链路：新上传文档将作者记为上传者用户名。
        # 存量文档（status=existed/MD5 命中）保持原样，不覆盖历史 author；
        # 存量 author 为 NULL 的文档在检索时 author_ids 过滤恒为 0 行，
        # 属历史数据，由后续数据修复处理，不在上传链路改动。
        if result.get("status") == "uploaded" and result.get("document_id"):
            user_name = await self._resolve_user_name(user_id)
            if user_name:
                doc = await self.session.get(Document, result["document_id"])
                if doc:
                    doc.author = user_name
                    await self.session.flush()
        # 提交整个上传事务（Document + Chunks + author）：get_db 正常路径不自动
        # 提交，session 退出即回滚，缺 commit 会导致上传的文档与切片从不落库。
        await self.session.commit()
        # 上传成功 → 失效 RAG 缓存，避免新文档不进入检索结果（S13）。
        await delete_rag_cache("rag:*")
        logger.info(
            "公共知识库文档上传成功 doc_id=%s status=%s chunks=%s user_id=%s",
            result.get("document_id"),
            result.get("status"),
            result.get("chunks"),
            user_id,
        )
        return result

    async def _resolve_user_name(self, user_id: int) -> str | None:
        """根据用户 ID 查询用户名，用于填充新上传文档的 author 字段。

        Args:
            user_id: 用户 ID。

        Returns:
            用户名；用户不存在时返回 None。
        """
        from models.user import User

        stmt = select(User.user_name).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

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