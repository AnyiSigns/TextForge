
from pydantic import BaseModel, ConfigDict, Field


class KnowledgeChunk(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    doc_id: int = Field(alias="docId")
    doc_name: str = Field(alias="docName")
    text: str
    score: float
    uploader_name: str | None = Field(default=None, alias="uploaderName")


class KnowledgeSearchResponse(BaseModel):
    chunks: list[KnowledgeChunk]
