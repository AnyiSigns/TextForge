from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageParams(BaseModel):
    """分页请求参数。

    Attributes:
        page: 当前页码，从 1 开始。
        page_size: 每页条目数。
    """

    page: int = Field(default=1, ge=1, description="当前页码，从 1 开始")
    page_size: int = Field(default=10, ge=1, le=100, description="每页条目数")

    @property
    def offset(self) -> int:
        """计算数据库查询偏移量。"""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """返回每页条目数，作为数据库查询的 limit。"""
        return self.page_size


class PageResult(BaseModel, Generic[T]):
    """分页结果。

    Attributes:
        items: 当前页的数据列表。
        total: 总条目数。
        page: 当前页码。
        page_size: 每页条目数。
    """

    items: list[T] = Field(default_factory=list, description="当前页的数据列表")
    total: int = Field(default=0, description="总条目数")
    page: int = Field(default=1, description="当前页码")
    page_size: int = Field(default=10, description="每页条目数")

    @property
    def total_pages(self) -> int:
        """计算总页数。"""
        if self.page_size <= 0:
            return 0
        return (self.total + self.page_size - 1) // self.page_size

    @property
    def has_next(self) -> bool:
        """是否有下一页。"""
        return self.page < self.total_pages

    @property
    def has_prev(self) -> bool:
        """是否有上一页。"""
        return self.page > 1
