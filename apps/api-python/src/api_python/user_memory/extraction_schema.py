from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

from api_python.models.enums import (
    UserMemoryType,
)


USER_MEMORY_EXTRACTION_MAX_COUNT = 5
USER_MEMORY_CONFIDENCE_THRESHOLD = 0.85

USER_MEMORY_KEY_PATTERN = (
    r"^[a-zA-Z0-9]+"
    r"(?:[._-][a-zA-Z0-9]+)*$"
)


MemoryKey = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=120,
        pattern=USER_MEMORY_KEY_PATTERN,
    ),
]


class UserMemoryUpsertCandidate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    action: Literal["UPSERT"]
    type: UserMemoryType
    memory_key: MemoryKey = Field(
        alias="memoryKey",
    )
    content: str = Field(
        min_length=1,
        max_length=500,
    )
    confidence: float = Field(
        ge=0,
        le=1,
    )


class UserMemoryArchiveCandidate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    action: Literal["ARCHIVE"]
    memory_key: MemoryKey = Field(
        alias="memoryKey",
    )
    confidence: float = Field(
        ge=0,
        le=1,
    )


UserMemoryCandidate = Annotated[
    UserMemoryUpsertCandidate
    | UserMemoryArchiveCandidate,
    Field(discriminator="action"),
]


class UserMemoryExtraction(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    memories: list[
        UserMemoryCandidate
    ] = Field(
        max_length=(
            USER_MEMORY_EXTRACTION_MAX_COUNT
        ),
    )