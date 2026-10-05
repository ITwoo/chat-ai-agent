from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base
from api_python.models.enums import RagDocumentStatus


if TYPE_CHECKING:
    from api_python.models.user import User


class RagDocument(Base):
    __tablename__ = "RagDocument"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        "userId",
        ForeignKey(
            "User.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="RagDocument_userId_fkey",
        ),
        nullable=False,
    )

    file_name: Mapped[str] = mapped_column(
        "fileName",
        String(255),
        nullable=False,
    )

    storage_key: Mapped[str] = mapped_column(
        "storageKey",
        String(255),
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        "mimeType",
        String(100),
        nullable=False,
    )

    size_bytes: Mapped[int] = mapped_column(
        "sizeBytes",
        Integer,
        nullable=False,
    )

    status: Mapped[RagDocumentStatus] = mapped_column(
        SqlEnum(
            RagDocumentStatus,
            name="RagDocumentStatus",
        ),
        nullable=False,
        server_default=text("'PENDING'"),
    )

    error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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
        back_populates="rag_documents",
    )

    chunks: Mapped[list[RagDocumentChunk]] = relationship(
        "RagDocumentChunk",
        back_populates="document",
        passive_deletes=True,
    )

    __table_args__ = (
        Index(
            "RagDocument_storageKey_key",
            "storageKey",
            unique=True,
        ),
        Index(
            "RagDocument_userId_idx",
            "userId",
        ),
        Index(
            "RagDocument_userId_status_idx",
            "userId",
            "status",
        ),
        Index(
            "RagDocument_createdAt_idx",
            "createdAt",
        ),
    )


class RagDocumentChunk(Base):
    __tablename__ = "RagDocumentChunk"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    document_id: Mapped[int] = mapped_column(
        "documentId",
        ForeignKey(
            "RagDocument.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="RagDocumentChunk_documentId_fkey",
        ),
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

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    token_count: Mapped[int | None] = mapped_column(
        "tokenCount",
        Integer,
        nullable=True,
    )

    embedding: Mapped[list[float] | None] = mapped_column(
        VECTOR(1536),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    document: Mapped[RagDocument] = relationship(
        "RagDocument",
        back_populates="chunks",
    )

    __table_args__ = (
        Index(
            "RagDocumentChunk_documentId_chunkIndex_key",
            "documentId",
            "chunkIndex",
            unique=True,
        ),
        Index(
            "RagDocumentChunk_documentId_idx",
            "documentId",
        ),
    )