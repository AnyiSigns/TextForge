from typing import Optional, Any
from pydantic import BaseModel, Field


class OutlineRequest(BaseModel):
    project_id: Optional[int] = Field(default=None, alias="projectId")
    data: Optional[Any] = Field(default=None, description="大纲嵌套结构")
