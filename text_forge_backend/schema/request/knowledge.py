
from pydantic import BaseModel, Field


class KnowledgeSearchRequest(BaseModel):
    query: str
    scope: str | None = "public"
    top_k: int | None = Field(default=3, gt=0, le=50)
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
