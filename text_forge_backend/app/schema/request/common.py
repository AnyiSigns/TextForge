from pydantic import BaseModel



class ChatRequest(BaseModel):
    user_id:int
    thread_id: str
    message: str


