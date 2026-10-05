from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base
from api_python.models.enums import (
    ChatMessageRole,
    ChatMessageStatus,
    UserMemoryExtractionStatus,
)


if TYPE_CHECKING:
    from api_python.models.user import User
    from api_python.models.user_memory import UserMemory


class ChatRoom(Base):
    __tablename__ = "ChatRoom"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        server_default=text("'새 채팅'"),
    )

    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    summary_through_message_id: Mapped[int | None] = mapped_column(
        "summaryThroughMessageId",
        Integer,
        nullable=True,
    )

    summary_updated_at: Mapped[datetime | None] = mapped_column(
        "summaryUpdatedAt",
        TIMESTAMP(precision=3),
        nullable=True,
    )

    user_id: Mapped[int] = mapped_column(
        "userId",
        ForeignKey(
            "User.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="ChatRoom_userId_fkey",
        ),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt",
        TIMESTAMP(precision=3),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(
        "User",
        back_populates="chat_rooms",
    )

    messages: Mapped[list[ChatMessage]] = relationship(
        "ChatMessage",
        back_populates="room",
        passive_deletes=True,
    )

    pending_approval: Mapped[AgentPendingApproval | None] = relationship(
        "AgentPendingApproval",
        back_populates="room",
        passive_deletes=True,
        uselist=False,
    )

    __table_args__ = (
        Index("ChatRoom_userId_idx", "userId"),
        Index("ChatRoom_createdAt_idx", "createdAt"),
        Index("ChatRoom_updatedAt_idx", "updatedAt"),
    )


class ChatMessage(Base):
    __tablename__ = "ChatMessage"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    room_id: Mapped[int] = mapped_column(
        "roomId",
        ForeignKey(
            "ChatRoom.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="ChatMessage_roomId_fkey",
        ),
        nullable=False,
    )

    role: Mapped[ChatMessageRole] = mapped_column(
        SqlEnum(
            ChatMessageRole,
            name="ChatMessageRole",
        ),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[ChatMessageStatus] = mapped_column(
        SqlEnum(
            ChatMessageStatus,
            name="ChatMessageStatus",
        ),
        nullable=False,
        server_default=text("'COMPLETED'"),
    )

    memory_extraction_status: Mapped[
        UserMemoryExtractionStatus | None
    ] = mapped_column(
        "memoryExtractionStatus",
        SqlEnum(
            UserMemoryExtractionStatus,
            name="UserMemoryExtractionStatus",
        ),
        nullable=True,
    )

    memory_extraction_error: Mapped[str | None] = mapped_column(
        "memoryExtractionError",
        Text,
        nullable=True,
    )

    memory_extraction_started_at: Mapped[datetime | None] = mapped_column(
        "memoryExtractionStartedAt",
        TIMESTAMP(precision=3),
        nullable=True,
    )

    memory_extracted_at: Mapped[datetime | None] = mapped_column(
        "memoryExtractedAt",
        TIMESTAMP(precision=3),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    room: Mapped[ChatRoom] = relationship(
        "ChatRoom",
        back_populates="messages",
    )

    rag_citations: Mapped[list[ChatMessageRagCitation]] = relationship(
        "ChatMessageRagCitation",
        back_populates="chat_message",
        passive_deletes=True,
    )

    sourced_user_memories: Mapped[list[UserMemory]] = relationship(
        "UserMemory",
        back_populates="source_message",
    )

    __table_args__ = (
        Index("ChatMessage_roomId_idx", "roomId"),
        Index(
            "ChatMessage_roomId_createdAt_idx",
            "roomId",
            "createdAt",
        ),
        Index("ChatMessage_createdAt_idx", "createdAt"),
        Index("ChatMessage_status_idx", "status"),
        Index(
            "ChatMessage_memoryExtractionStatus_memoryExtractionStartedA_idx",
            "memoryExtractionStatus",
            "memoryExtractionStartedAt",
        ),
    )


class AgentPendingApproval(Base):
    __tablename__ = "AgentPendingApproval"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    approval_id: Mapped[str] = mapped_column(
        "approvalId",
        PGUUID(as_uuid=False),
        nullable=False,
    )

    thread_id: Mapped[str] = mapped_column(
        "threadId",
        String(255),
        nullable=False,
    )

    room_id: Mapped[int] = mapped_column(
        "roomId",
        ForeignKey(
            "ChatRoom.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="AgentPendingApproval_roomId_fkey",
        ),
        nullable=False,
    )

    origin_user_message_id: Mapped[int] = mapped_column(
        "originUserMessageId",
        Integer,
        nullable=False,
    )

    request: Mapped[Any] = mapped_column(
        JSONB,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt",
        TIMESTAMP(precision=3),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
    )

    room: Mapped[ChatRoom] = relationship(
        "ChatRoom",
        back_populates="pending_approval",
    )

    __table_args__ = (
        Index(
            "AgentPendingApproval_approvalId_key",
            "approvalId",
            unique=True,
        ),
        Index(
            "AgentPendingApproval_roomId_key",
            "roomId",
            unique=True,
        ),
        Index(
            "AgentPendingApproval_threadId_idx",
            "threadId",
        ),
        Index(
            "AgentPendingApproval_originUserMessageId_idx",
            "originUserMessageId",
        ),
    )


class ChatMessageRagCitation(Base):
    __tablename__ = "ChatMessageRagCitation"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    chat_message_id: Mapped[int] = mapped_column(
        "chatMessageId",
        ForeignKey(
            "ChatMessage.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="ChatMessageRagCitation_chatMessageId_fkey",
        ),
        nullable=False,
    )

    document_id: Mapped[int] = mapped_column(
        "documentId",
        Integer,
        nullable=False,
    )

    chunk_id: Mapped[int] = mapped_column(
        "chunkId",
        Integer,
        nullable=False,
    )

    chunk_index: Mapped[int] = mapped_column(
        "chunkIndex",
        Integer,
        nullable=False,
    )

    page_number: Mapped[int | None] = mapped_column(
        "pageNumber",
        Integer,
        nullable=True,
    )

    file_name: Mapped[str] = mapped_column(
        "fileName",
        String(255),
        nullable=False,
    )

    similarity: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    chat_message: Mapped[ChatMessage] = relationship(
        "ChatMessage",
        back_populates="rag_citations",
    )

    __table_args__ = (
        Index(
            "ChatMessageRagCitation_chatMessageId_idx",
            "chatMessageId",
        ),
    )