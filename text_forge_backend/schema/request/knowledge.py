from typing import Optional
from pydantic import BaseModel, Field


class KnowledgeSearchRequest(BaseModel):
    query: str
    scope: Optional[str] = "public"
    top_k: Optional[int] = Field(default=3, gt=0, le=50)
    model_config_data: Optional[dict] = Field(default=None, alias="modelConfig")
