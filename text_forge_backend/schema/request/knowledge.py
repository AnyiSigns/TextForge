from typing import Optional
from pydantic import BaseModel


class KnowledgeSearchRequest(BaseModel):
    query: str
    scope: Optional[str] = "public"
    top_k: Optional[int] = 3
