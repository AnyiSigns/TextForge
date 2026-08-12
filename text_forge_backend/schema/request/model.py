from pydantic import BaseModel


class TestConnectionRequest(BaseModel):
    adapter: str
    base_url: str
    api_key: str
    model_id: str
