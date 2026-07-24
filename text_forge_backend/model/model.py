from sqlalchemy import ForeignKey, Integer
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
    compression: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    router_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    tool_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    vision_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)
    embedding_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=True)

    users: Mapped["User"] = relationship(back_populates="model_configs")
