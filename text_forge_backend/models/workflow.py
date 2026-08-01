
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Workflow(Base):
    __tablename__ = "workflows"
    id: Mapped[str] = mapped_column(String(255), primary_key=True, comment="工作流ID")
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True, comment="用户ID"
    )
    name: Mapped[str] = mapped_column(String(128), index=True, comment="工作流名称")
    description: Mapped[str] = mapped_column(Text, nullable=True, comment="工作流描述")
    builtin: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否内置")
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=True, comment="节点数据")
    edges: Mapped[dict] = mapped_column(JSONB, nullable=True, comment="边数据")

    users: Mapped["User"] = relationship(back_populates="workflows")
