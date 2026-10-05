from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base


if TYPE_CHECKING:
    from api_python.models.user import User


class RefreshTokenSession(Base):
    __tablename__ = "RefreshTokenSession"

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
            name="RefreshTokenSession_userId_fkey",
        ),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(
        "tokenHash",
        String(255),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt",
        TIMESTAMP(precision=3),
        nullable=False,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        "revokedAt",
        TIMESTAMP(precision=3),
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
        back_populates="refresh_token_sessions",
    )

    __table_args__ = (
        Index(
            "RefreshTokenSession_userId_idx",
            "userId",
        ),
        Index(
            "RefreshTokenSession_expiresAt_idx",
            "expiresAt",
        ),
        Index(
            "RefreshTokenSession_revokedAt_idx",
            "revokedAt",
        ),
    )