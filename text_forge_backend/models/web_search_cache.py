from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class WebSearchCache(Base):
    __tablename__ = "web_search_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="搜索缓存ID")
    query: Mapped[str] = mapped_column(String(500), nullable=False, index=True, comment="搜索查询")
    query_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True, comment="查询哈希")
    results: Mapped[list] = mapped_column(JSONB, nullable=False, default=[], comment="搜索结果")
    hit_count: Mapped[int] = mapped_column(Integer, default=0, comment="命中次数")
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), comment="最后访问时间")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="创建时间")
