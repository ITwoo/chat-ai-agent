from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api_python.models.base import Base


if TYPE_CHECKING:
    from api_python.models.user import User


class Expense(Base):
    __tablename__ = "Expense"

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
            name="Expense_userId_fkey",
        ),
        nullable=False,
    )

    operation_key: Mapped[str] = mapped_column(
        "operationKey",
        String(64),
        nullable=False,
    )

    amount: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    spent_at: Mapped[datetime] = mapped_column(
        "spentAt",
        TIMESTAMP(precision=3),
        nullable=False,
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
        back_populates="expenses",
    )

    update_operations: Mapped[list[ExpenseUpdateOperation]] = relationship(
        "ExpenseUpdateOperation",
        back_populates="expense",
        passive_deletes=True,
    )

    __table_args__ = (
        Index(
            "Expense_userId_operationKey_key",
            "userId",
            "operationKey",
            unique=True,
        ),
        Index(
            "Expense_userId_spentAt_idx",
            "userId",
            "spentAt",
        ),
        Index(
            "Expense_userId_category_idx",
            "userId",
            "category",
        ),
    )


class ExpenseUpdateOperation(Base):
    __tablename__ = "ExpenseUpdateOperation"

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
            name="ExpenseUpdateOperation_userId_fkey",
        ),
        nullable=False,
    )

    expense_id: Mapped[int] = mapped_column(
        "expenseId",
        ForeignKey(
            "Expense.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="ExpenseUpdateOperation_expenseId_fkey",
        ),
        nullable=False,
    )

    operation_key: Mapped[str] = mapped_column(
        "operationKey",
        String(64),
        nullable=False,
    )

    expected_version: Mapped[int] = mapped_column(
        "expectedVersion",
        Integer,
        nullable=False,
    )

    applied_version: Mapped[int] = mapped_column(
        "appliedVersion",
        Integer,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        TIMESTAMP(precision=3),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[User] = relationship(
        "User",
        back_populates="expense_update_operations",
    )

    expense: Mapped[Expense] = relationship(
        "Expense",
        back_populates="update_operations",
    )

    __table_args__ = (
        Index(
            "ExpenseUpdateOperation_userId_operationKey_key",
            "userId",
            "operationKey",
            unique=True,
        ),
        Index(
            "ExpenseUpdateOperation_expenseId_idx",
            "expenseId",
        ),
    )