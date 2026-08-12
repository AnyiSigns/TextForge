
from pydantic import BaseModel, ConfigDict, Field


class AgentMemoryRequest(BaseModel):
    book_id: int | None = Field(default=None, alias="bookId")
    memory_type: str = Field(alias="memoryType")
    content: str
    related_chapter_id: int | None = Field(default=None, alias="relatedChapterId")
    related_character_ids: list[int] | None = Field(default=[], alias="relatedCharacterIds")
    priority: int | None = Field(default=5)
    source: str | None = "user_manual"
    meta: dict | None = Field(default=None)
    # 保存时同步生成向量嵌入（模型配置，通常只含 embedding_config）；
    # 缺失时静默降级全文检索，保证保存不失败。
    model_config_data: dict | None = Field(default=None, alias="modelConfig")

    model_config = ConfigDict(populate_by_name=True)


class AgentMemoryUpdateRequest(BaseModel):
    memory_type: str | None = Field(default=None, alias="memoryType")
    content: str | None = None
    priority: int | None = None
    meta: dict | None = Field(default=None)

    model_config = ConfigDict(populate_by_name=True)


class AgentMemorySearchRequest(BaseModel):
    q: str = Field(alias="q")
    mode: str | None = Field(default="fulltext")
    book_id: int | None = Field(default=None, alias="bookId")
    memory_type: str | None = Field(default=None, alias="memoryType")
    top_k: int | None = Field(default=5, ge=1, le=20, alias="topK")
    model_config_data: dict | None = Field(default=None, alias="modelConfig")

    model_config = ConfigDict(populate_by_name=True)
