
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Workflow(Base):
    __tablename__ = "workflows"
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=True)
    edges: Mapped[dict] = mapped_column(JSONB, nullable=True)

    users: Mapped["User"] = relationship(back_populates="workflows")
