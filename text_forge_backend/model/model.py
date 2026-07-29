from sqlalchemy import ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from model.base import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ModelConfig(Base):
    __tablename__ = "model_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    main_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    audit_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    router_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    tool_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    vision_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    embedding_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    search_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)

    users: Mapped["User"] = relationship(back_populates="model_configs")


class Workflow(Base):
    __tablename__ = "workflows"
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=True)
    edges: Mapped[dict] = mapped_column(JSONB, nullable=True)

    users: Mapped["User"] = relationship(back_populates="workflows")
