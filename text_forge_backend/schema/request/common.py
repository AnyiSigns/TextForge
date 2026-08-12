from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PersonalRagHit(BaseModel):
    """个人库检索命中：随回合注入工作流上下文，字段必须受边界约束。

    前端最多传 3 条；后端上限 5 条、正文每条 2000 字符，防止用户把任意大小
    内容注入 prompt 与 checkpoint 造成 token/存储成本放大。
    """

    doc_name: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=2000)
    score: float = 0.0


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    thread_id: str
    message: str
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
    # 可选：当前书籍 id。Agent 对话时若用户已切换书籍/旧会话 book_id 为 0，
    # 前端每次请求携带当前 book_id，后端据此修正会话绑定的书籍。
    book_id: int | None = Field(default=None, alias="bookId")
    # 随回合下发的个人库检索结果（{doc_name, content, score} 列表）。
    # 直接放请求体而非 PATCH checkpoint：_prepare_agent_state 会以 last-value 语义
    # 把 checkpoint 中的 personal_rag_results 覆盖为 None，PATCH 在回合输入前必被清掉。
    personal_rag_results: list[PersonalRagHit] | None = Field(
        default=None, alias="personalRagResults", max_length=5
    )


class CompressRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")
    # 2.6 压缩配置一致性：请求体优先，缺省回退 checkpoint（2.10 剥离 api_key 后必须靠此注入）
    model_config_data: dict | None = Field(default=None, alias="modelConfig")


class ReviewActionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")
    action: Literal["retry", "accept", "edit", "terminate"]
    edited_content: str | None = Field(default=None, alias="editedContent", max_length=10000)
    chapter_id: int | None = Field(default=None, alias="chapterId")
