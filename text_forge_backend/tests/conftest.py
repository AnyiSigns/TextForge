"""Agent 工具测试共享基础设施。

提供不依赖真实数据库/LLM 的假会话与假模型工厂，
使工具测试可以覆盖完整业务逻辑与所有失败分支。
"""

from __future__ import annotations

import pytest
from models.book import Base


class FakeResult:
    """模拟 SQLAlchemy execute 的返回结果。"""

    def __init__(self, scalars=None, one=None, scalar=None):
        self._scalars = scalars or []
        self._one = one
        self._scalar = scalar if scalar is not None else (one if one is not None else None)

    def scalar(self):
        """返回标量结果（func.max 等聚合查询）。"""
        return self._scalar

    def scalar_one_or_none(self):
        """返回单条结果或 None（select(Book) 等）。"""
        return self._one

    def scalars(self):
        """返回自身以支持 .scalars().all() 链式调用。"""
        return self

    def all(self):
        """返回列表结果。"""
        return self._scalars

    def fetchall(self):
        """返回 (id,) 元组列表（部分查询使用）。"""
        return [(s.id,) for s in self._scalars]


class FakeSession:
    """按查询实体类型分发结果的假会话。

    rows: {实体类: 值}，值为 list 时按 scalars().all() 返回，
    为单个对象或 None 时按 scalar_one_or_none() 返回。
    """

    def __init__(self, rows: dict):
        self.rows = rows
        self.added: list = []
        self.committed = False
        self.flushed = False
        self._id_counter = 1000

    def _entity_of(self, stmt):
        """从 select 语句中提取查询的 ORM 实体。

        SQLAlchemy 2.0 中 select(Book) 的 froms 是 Table（books 表）而非 Book 类，
        需要反向查找映射类，以便与 rows 的类 key 匹配。
        """
        for f in stmt.get_final_froms():
            table = getattr(f, "__table__", None)
            if table is not None:
                return f
            # f 是 Table：在 registry 中反向查找映射类
            for mapper in Base.registry.mappers:
                if mapper.local_table is f:
                    return mapper.class_
        return None

    async def execute(self, stmt):
        entity = self._entity_of(stmt)
        value = self.rows.get(entity)
        if isinstance(value, list):
            return FakeResult(scalars=value)
        return FakeResult(one=value, scalar=value)

    def add(self, obj):
        """收集新增对象（工具 flush 后依赖其 id）。"""
        self.added.append(obj)

    async def flush(self):
        """模拟 flush：为无 id 的新对象分配自增 id。"""
        self.flushed = True
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._id_counter
                self._id_counter += 1

    async def commit(self):
        """模拟提交。"""
        self.committed = True


class _SessionCM:
    """async with session_factory() 上下文管理器。"""

    def __init__(self, session: FakeSession):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *args):
        return False


class FakeSessionFactory:
    """假 session_factory：每次调用返回同一 FakeSession 的上下文管理器。"""

    def __init__(self, rows: dict):
        self.session = FakeSession(rows)

    def __call__(self):
        return _SessionCM(self.session)


class FakeLLM:
    """假 LLM：ainvoke 返回固定字符串。"""

    def __init__(self, response: str):
        self.response = response

    async def ainvoke(self, messages):
        from types import SimpleNamespace

        return SimpleNamespace(content=self.response)


class FakeModelFactory:
    """假 ModelFactory：根据 model_config 里的 response 构造 FakeLLM。

    用法: model_config={"response": '{"chapters": []}'}
    """

    def __init__(self, config: dict):
        self.main = FakeLLM(config.get("response", ""))


@pytest.fixture
def fake_model_factory(monkeypatch):
    """monkeypatch core.model_factory.ModelFactory 为 FakeModelFactory。

    工具在函数内部延迟导入 ModelFactory，必须在模块属性上替换。
    """

    def _install():
        monkeypatch.setattr("core.model_factory.ModelFactory", FakeModelFactory)

    _install()
    return FakeModelFactory


@pytest.fixture
def fake_session_factory():
    """构造假 session_factory 的工厂函数。

    用法: factory = fake_session_factory({Book: book, Volume: [v1]})
    """
    return FakeSessionFactory
