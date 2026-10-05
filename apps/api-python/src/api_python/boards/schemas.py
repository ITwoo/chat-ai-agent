from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from api_python.models.enums import BoardStatus


class CreateBoardRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    title: str = Field(
        min_length=1,
    )

    description: str = Field(
        min_length=1,
    )


class UpdateBoardRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    title: str = Field(
        min_length=1,
    )

    description: str = Field(
        min_length=1,
    )

    status: BoardStatus


class UpdateBoardStatusRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    status: BoardStatus

    @field_validator(
        "status",
        mode="before",
    )
    @classmethod
    def normalize_status(
        cls,
        value: object,
    ) -> object:
        if isinstance(value, str):
            return value.upper()

        return value


class BoardResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int
    title: str
    description: str
    status: BoardStatus

    user_id: int = Field(
        serialization_alias="userId",
    )

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )

    updated_at: datetime = Field(
        serialization_alias="updatedAt",
    )