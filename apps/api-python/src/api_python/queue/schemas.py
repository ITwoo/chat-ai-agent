from dataclasses import dataclass
from typing import Literal


QueueJobState = Literal[
    "NOT_FOUND",
    "WAITING",
    "DELAYED",
    "ACTIVE",
    "COMPLETED",
    "FAILED",
    "UNKNOWN",
]


RemoveDocumentIngestionJobResult = Literal[
    "NOT_FOUND",
    "REMOVED",
    "ACTIVE",
]


@dataclass(
    frozen=True,
    slots=True,
)
class HealthCheckJobData:
    requested_at: str
    request_id: str | None = None


@dataclass(
    frozen=True,
    slots=True,
)
class HealthCheckJobResult:
    requested_at: str
    processed_at: str
    elapsed_ms: int


@dataclass(
    frozen=True,
    slots=True,
)
class DocumentIngestionJobData:
    document_id: int
    user_id: int
    storage_key: str
    request_id: str | None = None


@dataclass(
    frozen=True,
    slots=True,
)
class DocumentIngestionJobResult:
    document_id: int
    chunk_count: int


@dataclass(
    frozen=True,
    slots=True,
)
class DocumentIngestionJobSnapshot:
    state: QueueJobState
    failed_reason: str | None = None


@dataclass(
    frozen=True,
    slots=True,
)
class UserMemoryExtractionJobData:
    user_id: int
    message_id: int
    request_id: str | None = None


@dataclass(
    frozen=True,
    slots=True,
)
class UserMemoryExtractionJobResult:
    extracted_count: int
    saved_count: int
    archived_count: int
    skipped_count: int


@dataclass(
    frozen=True,
    slots=True,
)
class UserMemoryExtractionJobSnapshot:
    state: QueueJobState
    failed_reason: str | None = None