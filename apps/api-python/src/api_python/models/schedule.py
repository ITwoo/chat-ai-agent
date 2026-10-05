from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base


if TYPE_CHECKING:
    from api_python.models.user import User


class Schedule(Base):
    __tablename__ = "Schedule"

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
            name="Schedule_userId_fkey",
        ),
        nullable=False,
    )

    operation_key: Mapped[str] = mapped_column(
        "operationKey",
        String(64),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    location: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    starts_at: Mapped[datetime] = mapped_column(
        "startsAt",
        TIMESTAMP(precision=3),
        nullable=False,
    )

    ends_at: Mapped[datetime | None] = mapped_column(
        "endsAt",
        TIMESTAMP(precision=3),
        nullable=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
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
        back_populates="schedules",
    )

    __table_args__ = (
        Index(
            "Schedule_userId_operationKey_key",
            "userId",
            "operationKey",
            unique=True,
        ),
        Index(
            "Schedule_userId_startsAt_idx",
            "userId",
            "startsAt",
        ),
    )