"""VectorRepository 过滤分支 与 KnowledgeService 错误路径测试。

覆盖：
- search_external_books 的 doc_ids / author_ids / sample 过滤条件传递
- search_public embedding 失败时抛具体 ValueError（而非静默空列表）
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_search_external_books_passes_author_ids_and_sample(monkeypatch):
    """author_ids / sample 过滤条件应被构造进 SQL where（此前为死代码分支）。"""
    from domains.knowledge.repository import VectorRepository

    seen_stmt = {}

    class FakeRows:
        def all(self):
            return []

    class FakeSession:
        async def execute(self, stmt):
            seen_stmt["stmt"] = stmt
            return FakeRows()

    repo = VectorRepository(FakeSession())
    await repo.search_external_books(
        query_embedding=[0.1, 0.2],
        rag_filter={
            "query": "测试",
            "doc_ids": ["1", "2", "abc"],
            "author_ids": ["作者A"],
            "sample": "设定",
        },
        top_k=5,
        use_cache=False,
    )
    sql = str(seen_stmt["stmt"])
    # doc_ids 非数字被过滤掉；author_ids 与 sample 进入 WHERE
    assert "documents.id IN" in sql
    assert "documents.author IN" in sql
    assert "file_name" in sql
    assert "LIKE" in sql.upper()


@pytest.mark.asyncio
async def test_search_public_embedding_failure_raises_specific_error(monkeypatch):
    """embedding 生成失败时 search_public 应抛出带具体原因的 ValueError。"""
    from domains.knowledge.service import KnowledgeService

    class BoomEmbedding:
        async def aembed_query(self, query):
            raise RuntimeError("embedding 服务不可用")

    class BoomFactory:
        def __init__(self, config):
            self.embedding = BoomEmbedding()

    monkeypatch.setattr(
        "domains.knowledge.service.ModelFactory", BoomFactory
    )
    service = KnowledgeService(object())
    with pytest.raises(ValueError) as exc_info:
        await service.search_public("测试查询", top_k=3, model_config={"x": 1})
    assert "embedding 生成失败" in str(exc_info.value)


@pytest.mark.asyncio
async def test_search_public_without_model_config_falls_back_to_fulltext(monkeypatch):
    """未提供模型配置（无 embedding）时应回退全文检索而非抛错。"""
    from domains.knowledge.service import KnowledgeService

    seen_stmt = {}

    class FakeRows:
        def all(self):
            return []

    class FakeSession:
        async def execute(self, stmt):
            seen_stmt["stmt"] = stmt
            return FakeRows()

    service = KnowledgeService(FakeSession())
    result = await service.search_public("测试查询", top_k=3, model_config=None)
    assert result == []
    sql = str(seen_stmt["stmt"])
    assert "LIKE" in sql.upper()
    assert "length" in sql.lower()


@pytest.mark.asyncio
async def test_search_public_empty_embedding_falls_back_to_fulltext(monkeypatch):
    """embedding 生成空向量时同样回退全文检索。"""
    from domains.knowledge.service import KnowledgeService

    seen_stmt = {}

    class FakeRows:
        def all(self):
            return []

    class FakeSession:
        async def execute(self, stmt):
            seen_stmt["stmt"] = stmt
            return FakeRows()

    class EmptyEmbedding:
        async def aembed_query(self, query):
            return []

    class EmptyFactory:
        def __init__(self, config):
            self.embedding = EmptyEmbedding()

    monkeypatch.setattr(
        "domains.knowledge.service.ModelFactory", EmptyFactory
    )
    service = KnowledgeService(FakeSession())
    result = await service.search_public("测试查询", top_k=3, model_config={"x": 1})
    assert result == []
    sql = str(seen_stmt["stmt"])
    assert "LIKE" in sql.upper()
    assert "length" in sql.lower()


@pytest.mark.asyncio
async def test_search_public_blank_query_returns_empty(monkeypatch):
    """空查询直接返回空列表，不抛错。"""
    from domains.knowledge.service import KnowledgeService

    service = KnowledgeService(object())
    result = await service.search_public("   ", top_k=3, model_config=None)
    assert result == []


@pytest.mark.asyncio
async def test_search_external_books_returns_score_from_distance():
    """YEL-1 回归：检索结果必须同时带 score=1-distance。

    节点级 RAG 与个人库注入都经 _format_external_documents 渲染相关度，
    只返回 distance 会使其恒为 0.0%。
    """
    from domains.knowledge.repository import VectorRepository

    class FakeRows:
        def all(self):
            return [
                SimpleNamespace(
                    Chunk=SimpleNamespace(doc_id=1),
                    doc_title="设定集",
                    doc_author="作者A",
                    content="世界观",
                    distance=0.2,
                )
            ]

    class FakeSession:
        async def execute(self, stmt):
            return FakeRows()

    repo = VectorRepository(FakeSession())
    items = await repo.search_external_books(
        query_embedding=[0.1, 0.2],
        rag_filter={"query": "世界观"},
        top_k=3,
        use_cache=False,
    )
    assert len(items) == 1
    assert items[0]["score"] == pytest.approx(0.8)
    assert items[0]["distance"] == pytest.approx(0.2)
