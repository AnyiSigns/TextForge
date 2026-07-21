from pydantic import BaseModel, ConfigDict, EmailStr, Field
from schema.response.auth import UserResponse


class ProfileResponse(BaseModel):
    user: UserResponse
