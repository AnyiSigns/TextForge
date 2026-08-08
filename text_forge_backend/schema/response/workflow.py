
from pydantic import BaseModel, ConfigDict

from schema.workflow import Workflow


class ListWorkflowsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflows: list["Workflow"]


class WorkflowDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    workflow: "Workflow"
