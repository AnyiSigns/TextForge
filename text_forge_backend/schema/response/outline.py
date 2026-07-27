from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class OutlineResponse(BaseModel):
    id: int
    project_id: int = Field(alias="projectId")
    data: Optional[Any] = Field(default=None, description="大纲嵌套结构")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


class ListOutlinesResponse(BaseModel):
    outlines: List[OutlineResponse]
