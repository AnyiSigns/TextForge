from __future__ import annotations
from typing import Any, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class PageParams(BaseModel):
    page: int = 1
    page_size: int = 20

class PageResult(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def create(cls, items: list[Any], total: int, params: PageParams) -> "PageResult":
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=(total + params.page_size - 1) // params.page_size,
        )

__all__ = ["PageParams", "PageResult"]
