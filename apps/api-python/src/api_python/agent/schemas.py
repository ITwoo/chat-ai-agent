from typing import Literal, Annotated

from api_python.models import expense
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
)


class ExpenseApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True
    )

    id: int = Field(
        gt=0,
    )

    amount: int = Field(
        gt=0,
    )

    category: str
    title: str
    memo: str | None

    spent_at: str = Field(
        alias="spentAt",
    )

    version: int | None = Field(
        default=None,
        ge=0,
    )

class ExpenseUpdateChanges(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    amount: int | None = Field(
        default=None,
        gt=0,
    )

    category: str | None = None
    title: str | None = None

    memo: str | None = None

    spent_at: str | None = Field(
        default=None,
        alias="spentAt",
    )

    @field_validator(
        "amount",
        "category",
        "title",
        "spent_at",
        mode="before",
    )
    @classmethod
    def reject_explici_none(
        cls,
        value: object,
    ) -> object:
        if value is None:
            raise ValueError(
                "null은 허용되지 않습니다."
            )

        return value

    
class ExpenseUpdateApprovalRequest(
    BaseModel
):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    type: Literal[
        "expense_update_approval"
    ]

    action: Literal[
        "update_expense"
    ]

    message: str

    expense: ExpenseApprovalTarget

    changes: ExpenseUpdateChanges


class ExpenseDeleteApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    id: int = Field(
        gt=0,
    )

    amount: int = Field(
        gt=0,
    )

    category: str
    title: str
    memo: str | None

    spent_at: str = Field(
        alias="spentAt",
    )

    version: int = Field(
        ge=0,
    )

class ExpenseDeleteApprovalRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    type: Literal[
        "expense_delete_approval"
    ]

    action: Literal[
        "delete_expense"
    ]

    message: str

    expense: ExpenseDeleteApprovalTarget

AgentApprovalRequest = Annotated[
    ExpenseUpdateApprovalRequest
    | ExpenseDeleteApprovalRequest,
    Field(
        discriminator="type",
    ),
]

agent_approval_request_adapter = TypeAdapter(
    AgentApprovalRequest
)