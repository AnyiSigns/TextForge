from sqlalchemy import select
from domains.shared.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from models.book import Outline
import copy
import json


class OutlineRepository(BaseRepository[Outline]):
    """大纲仓储。"""

    def __init__(self, session: AsyncSession):
        """初始化 OutlineRepository。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        super().__init__(Outline, session)

    async def list_outlines(self, book_id: int):
        """查询书籍大纲列表。

        Args:
            book_id: 书籍 ID。

        Returns:
            大纲实例列表。
        """
        stmt = select(Outline).where(Outline.book_id == book_id).order_by(Outline.id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def book_outline_detail(self, book_id: int, outline_id: int):
        """查询单个大纲。

        Args:
            book_id: 书籍 ID。
            outline_id: 大纲 ID。

        Returns:
            大纲实例，不存在返回 None。
        """
        stmt = select(Outline).where(
            Outline.book_id == book_id, Outline.id == outline_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_outline(self, book_id: int, data):
        """创建大纲。

        Args:
            book_id: 书籍 ID。
            data: 大纲数据，可为 dict 或 JSON 字符串。

        Returns:
            新创建的大纲实例。
        """
        payload = data.get("data", data) if isinstance(data, dict) else data
        content = (
            json.dumps(payload, ensure_ascii=False)
            if not isinstance(payload, str)
            else payload
        )
        instance = await self.add(
            book_id=book_id,
            content=content,
            node_type="volume",
            title=payload.get("title", "") if isinstance(payload, dict) else "",
        )
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def update_outline(self, outline_id: int, **kwargs):
        """更新大纲。

        支持通过 chapter_id + summary 更新章节摘要，或通过 data 更新整棵大纲树。

        Args:
            outline_id: 大纲 ID。
            **kwargs: 更新字段。

        Returns:
            更新后的大纲实例，不存在返回 None。
        """
        instance = await self.get(outline_id)
        if not instance:
            return None
        if "chapter_id" in kwargs and "summary" in kwargs:
            chapter_id = kwargs.pop("chapter_id")
            summary = kwargs.pop("summary")
            content = copy.deepcopy(instance.content or "[]")
            try:
                data = json.loads(content) if isinstance(content, str) else content
            except Exception:
                data = []
            if isinstance(data, list):
                for vol in data:
                    if isinstance(vol, dict):
                        for ch in vol.get("chapters") or []:
                            if ch.get("id") == chapter_id:
                                ch["summary"] = summary
                                break
            kwargs["content"] = (
                json.dumps(data, ensure_ascii=False)
                if not isinstance(data, str)
                else data
            )
        if "data" in kwargs:
            data = kwargs.get("data")
            if isinstance(data, dict):
                data = data.get("data", data)
            kwargs["content"] = (
                json.dumps(data, ensure_ascii=False)
                if not isinstance(data, str)
                else data
            )
            del kwargs["data"]
        for key, value in kwargs.items():
            if value is not None:
                setattr(instance, key, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete_outline(self, outline_id: int):
        """删除大纲。

        Args:
            outline_id: 大纲 ID。

        Returns:
            BaseRepository.delete 的返回值。
        """
        return await self.delete(outline_id)
