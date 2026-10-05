from pydantic import BaseModel, ConfigDict, Field


class AuthCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(
        min_length=4,
        max_length=20,
    )

    password: str = Field(
        min_length=6,
        max_length=20,
        pattern=r"^[a-zA-Z0-9]*$",
    )


class LoginResponse(BaseModel):
    access_token: str = Field(
        serialization_alias="accessToken",
    )


class UserResponse(BaseModel):
    id: int
    username: str