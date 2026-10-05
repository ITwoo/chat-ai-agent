from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base


if TYPE_CHECKING:
    from api_python.models.user import User


class BoardStatus(str, Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class Board(Base):
    __tablename__ = "Board"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[BoardStatus] = mapped_column(
        SqlEnum(
            BoardStatus,
            name="BoardStatus",
        ),
        nullable=False,
        server_default=text("'PUBLIC'"),
    )

    user_id: Mapped[int] = mapped_column(
        "userId",
        ForeignKey(
            "User.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="Board_userId_fkey",
        ),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt",
        DateTime,
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(
        back_populates="boards",
    )

    __table_args__ = (
        Index("Board_userId_idx", "userId"),
        Index("Board_status_idx", "status"),
        Index("Board_createdAt_idx", "createdAt"),
    )