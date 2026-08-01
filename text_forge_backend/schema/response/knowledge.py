
from pydantic import BaseModel


class KnowledgeChunk(BaseModel):
    doc_id: int
    doc_name: str
    text: str
    score: float
    uploader_name: str | None = None


class KnowledgeSearchResponse(BaseModel):
    chunks: list[KnowledgeChunk]
