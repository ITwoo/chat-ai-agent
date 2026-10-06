from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from api_python.models.enums import UserMemoryType


UserMemoryWriteResult = Literal[
    "APPLIED",
    "STALE",
]


@dataclass(
    slots=True,
    frozen=True,
)
class UpsertUserMemoryInput:
    type: UserMemoryType
    memory_key: str
    content: str
    source_message_id: int | None


@dataclass(
    slots=True,
    frozen=True,
)
class UpsertExtractedUserMemoryInput:
    type: UserMemoryType
    memory_key: str
    content: str
    source_message_id: int


@dataclass(
    slots=True,
    frozen=True,
)
class SearchUserMemoriesInput:
    query: str | None = None
    type: UserMemoryType | None = None
    limit: int | None = None


@dataclass(
    slots=True,
    frozen=True,
)
class UserMemorySearchResult:
    id: int
    type: UserMemoryType
    memory_key: str
    content: str
    updated_at: datetime
    similarity: float | None


@dataclass(
    slots=True,
    frozen=True,
)
class RelevantUserMemory:
    id: int
    type: UserMemoryType
    memory_key: str
    content: str
    updated_at: datetime
    similarity: float


@dataclass(
    slots=True,
    frozen=True,
)
class UserMemoryEmbeddingBackfillBatchResult:
    selected_count: int
    updated_count: int
    failed_memory_ids: list[int]
    next_cursor: int | None


@dataclass(
    slots=True,
    frozen=True,
)
class RecoverUserMemoryExtractionsResult:
    checked_count: int
    requeued_count: int
    reset_to_pending_count: int
    marked_failed_count: int
    active_count: int


@dataclass(
    slots=True,
    frozen=True,
)
class UserMemoryExtractionRunResult:
    extracted_count: int
    saved_count: int
    archived_count: int
    skipped_count: int