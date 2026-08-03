from typing import Any

from pydantic import BaseModel, Field


class CardField(BaseModel):
    key: str = ""
    value: str = ""


class Card(BaseModel):
    title: str = ""
    fields: list[CardField] = []
    card_type: str = "card"


class CardBatch(BaseModel):
    step: str = ""
    batch_index: int = 0
    cards: list[Card] = []
    total_batches: int = 1


class GenerateRequest(BaseModel):
    book_id: int
    model_config_data: dict[str, Any] | None = None
    context: dict[str, Any] = {}
    requirements: str = ""
    batch_size: int = Field(default=4, ge=1, le=6)
    variation: str = ""  # creative_setting 用，传入不同的方向指导


class CharacterRelationRequest(BaseModel):
    book_id: int
    model_config_data: dict[str, Any] | None = None
    characters: list[dict[str, Any]] = []
    requirements: str = ""


class OutlineRequest(BaseModel):
    book_id: int
    model_config_data: dict[str, Any] | None = None
    context: dict[str, Any] = {}
    volume_count: int = Field(default=3, ge=1, le=20)
    chapters_per_volume: int = Field(default=5, ge=1, le=30)
    nodes_per_chapter: int = Field(default=3, ge=0, le=10)
    mode: str = "all"
    requirements: str = ""


class RegenerateRequest(BaseModel):
    book_id: int
    model_config_data: dict[str, Any] | None = None
    context: dict[str, Any] = {}
    step: str = ""
    card_indices: list[int] = []
    per_card_requirements: dict[str, str] = {}
    requirements: str = ""


class BatchCreateRequest(BaseModel):
    book_id: int
    step: str = ""
    entities: list[dict[str, Any]] = []
