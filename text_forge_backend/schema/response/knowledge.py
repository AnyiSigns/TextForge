from typing import List, Optional
from pydantic import BaseModel


class KnowledgeChunk(BaseModel):
    doc_id: str
    doc_name: str
    text: str
    score: float
    uploader_name: Optional[str] = None


class KnowledgeSearchResponse(BaseModel):
    chunks: List[KnowledgeChunk]
