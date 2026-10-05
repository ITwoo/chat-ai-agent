from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import CheckConstraint
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base
from api_python.models.enums import (
    UserMemoryStatus,
    UserMemoryType,
)


if TYPE_CHECKING:
    from api_python.models.chat import ChatMessage
    from api_python.models.user import User


class UserMemory(Base):
    __tablename__ = "UserMemory"

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
            name="UserMemory_userId_fkey",
        ),
        nullable=False,
    )

    type: Mapped[UserMemoryType] = mapped_column(
        SqlEnum(
            UserMemoryType,
            name="UserMemoryType",
        ),
        nullable=False,
    )

    memory_key: Mapped[str] = mapped_column(
        "memoryKey",
        String(120),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    embedding: Mapped[list[float] | None] = mapped_column(
        VECTOR(1536),
        nullable=True,
    )

    status: Mapped[UserMemoryStatus] = mapped_column(
        SqlEnum(
            UserMemoryStatus,
            name="UserMemoryStatus",
        ),
        nullable=False,
        server_default=text("'ACTIVE'"),
    )

    source_message_id: Mapped[int | None] = mapped_column(
        "sourceMessageId",
        ForeignKey(
            "ChatMessage.id",
            ondelete="SET NULL",
            onupdate="CASCADE",
            name="UserMemory_sourceMessageId_fkey",
        ),
        nullable=True,
    )

    last_confirmed_at: Mapped[datetime] = mapped_column(
        "lastConfirmedAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
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

    deleted_at: Mapped[datetime | None] = mapped_column(
        "deletedAt",
        TIMESTAMP(precision=3),
        nullable=True,
    )

    user: Mapped[User] = relationship(
        "User",
        back_populates="memories",
    )

    source_message: Mapped[ChatMessage | None] = relationship(
        "ChatMessage",
        back_populates="sourced_user_memories",
    )

    __table_args__ = (
        Index(
            "UserMemory_userId_memoryKey_key",
            "userId",
            "memoryKey",
            unique=True,
        ),
        Index(
            "UserMemory_userId_status_idx",
            "userId",
            "status",
        ),
        Index(
            "UserMemory_userId_type_status_idx",
            "userId",
            "type",
            "status",
        ),
        Index(
            "UserMemory_sourceMessageId_idx",
            "sourceMessageId",
        ),
        CheckConstraint(
            """
            (
                "status" = 'DELETED'::"UserMemoryStatus"
                AND "deletedAt" IS NOT NULL
                AND "sourceMessageId" IS NULL
                AND "content" = ''
                AND "embedding" IS NULL
            )
            OR
            (
                "status" <> 'DELETED'::"UserMemoryStatus"
                AND "deletedAt" IS NULL
            )
            """,
            name="UserMemory_deleted_state_check",
        ),
    )