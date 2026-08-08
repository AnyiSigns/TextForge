from pydantic import BaseModel

from schema.response.auth import UserResponse


class ProfileResponse(BaseModel):
    user: UserResponse
