from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Index, String, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base


if TYPE_CHECKING:
    from api_python.models.auth import RefreshTokenSession
    from api_python.models.board import Board
    from api_python.models.chat import ChatRoom
    from api_python.models.expense import Expense, ExpenseUpdateOperation
    from api_python.models.rag import RagDocument
    from api_python.models.schedule import Schedule
    from api_python.models.user_memory import UserMemory


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    username: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    password: Mapped[str] = mapped_column(
        String(255),
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

    boards: Mapped[list[Board]] = relationship(
        "Board",
        back_populates="user",
        passive_deletes=True,
    )

    chat_rooms: Mapped[list[ChatRoom]] = relationship(
        "ChatRoom",
        back_populates="user",
        passive_deletes=True,
    )

    expenses: Mapped[list[Expense]] = relationship(
        "Expense",
        back_populates="user",
        passive_deletes=True,
    )

    refresh_token_sessions: Mapped[list[RefreshTokenSession]] = relationship(
        "RefreshTokenSession",
        back_populates="user",
        passive_deletes=True,
    )

    memories: Mapped[list[UserMemory]] = relationship(
        "UserMemory",
        back_populates="user",
        passive_deletes=True,
    )

    rag_documents: Mapped[list[RagDocument]] = relationship(
        "RagDocument",
        back_populates="user",
        passive_deletes=True,
    )

    expense_update_operations: Mapped[list[ExpenseUpdateOperation]] = relationship(
        "ExpenseUpdateOperation",
        back_populates="user",
        passive_deletes=True,
    )

    schedules: Mapped[list[Schedule]] = relationship(
        "Schedule",
        back_populates="user",
        passive_deletes=True,
    )

    __table_args__ = (
        Index(
            "User_username_key",
            "username",
            unique=True,
        ),
    )