from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from api_python.models.enums import RagDocumentStatus


class RagCitation(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    document_id: int = Field(
        serialization_alias="documentId",
        gt=0,
    )

    chunk_id: int = Field(
        serialization_alias="chunkId",
        gt=0,
    )

    chunk_index: int = Field(
        serialization_alias="chunkIndex",
        ge=0,
    )

    page_number: int | None = Field(
        serialization_alias="pageNumber",
        default=None,
    )

    file_name: str = Field(
        serialization_alias="fileName",
        min_length=1,
    )

    similarity: float = Field(
        ge=-1,
        le=1,
    )


class GetRagDocumentsQuery(BaseModel):
    cursor: int | None = None

    limit: int | None = Field(
        default=None,
        ge=1,
        le=50,
    )


class RagDocumentResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int

    file_name: str = Field(
        serialization_alias="fileName",
    )

    mime_type: str = Field(
        serialization_alias="mimeType",
    )

    size_bytes: int = Field(
        serialization_alias="sizeBytes",
    )

    status: RagDocumentStatus
    error: str | None

    chunk_count: int = Field(
        serialization_alias="chunkCount",
    )

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )

    updated_at: datetime = Field(
        serialization_alias="updatedAt",
    )


class RagDocumentsPageResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    documents: list[RagDocumentResponse]

    next_cursor: int | None = Field(
        serialization_alias="nextCursor",
    )


class RagDocumentUploadResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    id: int

    file_name: str = Field(
        serialization_alias="fileName",
    )

    mime_type: str = Field(
        serialization_alias="mimeType",
    )

    size_bytes: int = Field(
        serialization_alias="sizeBytes",
    )

    status: RagDocumentStatus

    job_id: str = Field(
        serialization_alias="jobId",
    )

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )


class RagDocumentReprocessResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    document_id: int = Field(
        serialization_alias="documentId",
    )

    status: str


class RagDocumentDeleteResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    document_id: int = Field(
        serialization_alias="documentId",
    )

    deleted: bool


class RagSearchRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
    )

    query: str = Field(
        min_length=1,
        max_length=2000,
    )

    lexical_queries: list[
        str
    ] | None = Field(
        default=None,
        serialization_alias="lexicalQueries",
        validation_alias="lexicalQueries",
    )

    limit: int | None = Field(
        default=None,
        ge=1,
        le=10,
    )


class RagSearchResultResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    chunk_id: int = Field(
        serialization_alias="chunkId",
    )

    document_id: int = Field(
        serialization_alias="documentId",
    )

    chunk_index: int = Field(
        serialization_alias="chunkIndex",
    )

    page_number: int | None = Field(
        serialization_alias="pageNumber",
    )

    content: str

    token_count: int | None = Field(
        serialization_alias="tokenCount",
    )

    file_name: str = Field(
        serialization_alias="fileName",
    )

    distance: float
    similarity: float

    vector_rank: int | None = Field(
        serialization_alias="vectorRank",
    )

    keyword_rank: int | None = Field(
        serialization_alias="keywordRank",
    )

    rrf_score: float = Field(
        serialization_alias="rrfScore",
    )