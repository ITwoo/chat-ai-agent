from dataclasses import dataclass

from api_python.models.enums import RagDocumentStatus


@dataclass(slots=True, frozen=True)
class RagEmbeddingResult:
    embedding: list[float]
    token_count: int


@dataclass(slots=True, frozen=True)
class EmbeddedChunk:
    chunk_index: int
    page_number: int | None
    content: str
    token_count: int
    embedding: list[float]


@dataclass(slots=True, frozen=True)
class RagSearchResult:
    chunk_id: int
    document_id: int
    chunk_index: int
    page_number: int | None
    content: str
    token_count: int | None
    file_name: str
    distance: float
    similarity: float
    vector_rank: int | None
    keyword_rank: int | None
    rrf_score: float


@dataclass(slots=True, frozen=True)
class RagDocumentListItem:
    id: int
    file_name: str
    mime_type: str
    size_bytes: int
    status: RagDocumentStatus
    error: str | None
    chunk_count: int
    created_at: object
    updated_at: object