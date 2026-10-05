from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from api_python.models.enums import (
    ChatMessageRole,
    ChatMessageStatus,
    UserMemoryExtractionStatus,
)


class CreateChatRoomRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )


class GetChatMessagesQuery(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    cursor: int | None = None

    limit: int | None = Field(
        default=None,
        ge=1,
        le=50,
    )


class JoinRoomRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    room_id: int = Field(
        alias="roomId",
        ge=1,
    )


class RetryMessageRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    room_id: int = Field(
        alias="roomId",
        ge=1,
    )

    user_message_id: int = Field(
        alias="userMessageId",
        ge=1,
    )


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    room_id: int = Field(
        alias="roomId",
        ge=1,
    )

    content: str = Field(
        min_length=1,
    )


class UpdateChatRoomRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    title: str = Field(
        min_length=1,
        max_length=100,
    )


class ChatRoomResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int
    title: str
    summary: str | None

    summary_through_message_id: int | None = Field(
        serialization_alias="summaryThroughMessageId",
    )

    summary_updated_at: datetime | None = Field(
        serialization_alias="summaryUpdatedAt",
    )

    user_id: int = Field(
        serialization_alias="userId",
    )

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )

    updated_at: datetime = Field(
        serialization_alias="updatedAt",
    )


class ChatMessageRagCitationResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int

    chat_message_id: int = Field(
        serialization_alias="chatMessageId",
    )

    document_id: int = Field(
        serialization_alias="documentId",
    )

    chunk_id: int = Field(
        serialization_alias="chunkId",
    )

    chunk_index: int = Field(
        serialization_alias="chunkIndex",
    )

    page_number: int | None = Field(
        serialization_alias="pageNumber",
    )

    file_name: str = Field(
        serialization_alias="fileName",
    )

    similarity: float

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int

    room_id: int = Field(
        serialization_alias="roomId",
    )

    role: ChatMessageRole

    content: str

    status: ChatMessageStatus

    memory_extraction_status: (
        UserMemoryExtractionStatus | None
    ) = Field(
        serialization_alias="memoryExtractionStatus",
    )

    memory_extraction_error: str | None = Field(
        serialization_alias="memoryExtractionError",
    )

    memory_extraction_started_at: datetime | None = Field(
        serialization_alias="memoryExtractionStartedAt",
    )

    memory_extracted_at: datetime | None = Field(
        serialization_alias="memoryExtractedAt",
    )

    created_at: datetime = Field(
        serialization_alias="createdAt",
    )

    rag_citations: list[
        ChatMessageRagCitationResponse
    ] = Field(
        default_factory=list,
        serialization_alias="ragCitations",
    )


class ChatMessagesPageResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    messages: list[ChatMessageResponse]

    next_cursor: int | None = Field(
        serialization_alias="nextCursor",
    )