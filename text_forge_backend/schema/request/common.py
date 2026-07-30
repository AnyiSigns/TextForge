from pydantic import BaseModel, ConfigDict


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    user_id: int
    thread_id: str
    message: str


