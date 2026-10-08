import turtle
from typing import Literal, Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    UUID4,
    field_validator,
)
from sqlalchemy import true
from uvicorn import Config


class ExpenseApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    id: int = Field(gt=0)
    amount: int = Field(gt=0)
    category: str
    title: str
    memo: str | None

    spent_at: str = Field(alias="spentAt")

    version: int | None = Field(
        default=None,
        ge=0,
    )

class ExpenseUpdateChanges(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
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
    def reject_explicit_none(
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
        validate_by_alias=True,
        validate_by_name=True,
    )

    type: Literal["expense_update_approval"]

    action: Literal["update_expense"]
    message: str
    expense: ExpenseApprovalTarget
    changes: ExpenseUpdateChanges


class ExpenseDeleteApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    id: int = Field(gt=0)
    amount: int = Field(gt=0)
    category: str
    title: str
    memo: str | None
    spent_at: str = Field(alias="spentAt")
    version: int = Field(ge=0)

class ExpenseDeleteApprovalRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    type: Literal["expense_delete_approval"]
    action: Literal["delete_expense"]
    message: str
    expense: ExpenseDeleteApprovalTarget

class ScheduleApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    id: int = Field(gt=0)
    title: str
    memo: str | None
    location: str | None
    starts_at: str = Field(alias="startsAt")
    ends_at: str | None = Field(alias="endsAt")
    version: int | None = Field(default=None, ge=0)

class ScheduleUpdateChanges(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    title: str | None = None
    memo: str | None = None
    location: str | None = None
    starts_at: str | None = Field(default=None, alias="startsAt")
    ends_at: str | None = Field(default=None, alias="endsAt")

    @field_validator("title", "starts_at", mode="before")
    @classmethod
    def reject_explicit_none(cls, value: object) -> object:
        if value is None:
            raise ValueError("null은 허용되지 않습니다.")
        return value

class ScheduleUpdateApprovalRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    type: Literal["schedule_update_approval"]
    action: Literal["update_schedule"]
    message: str
    schedule: ScheduleApprovalTarget
    changes: ScheduleUpdateChanges

class ScheduleDeleteApprovalTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    id: int = Field(gt=0)
    title: str
    memo: str | None
    location: str | None
    starts_at: str = Field(alias="startsAt")
    ends_at: str | None = Field(alias="endsAt")
    version: int = Field(ge=0)

class ScheduleDeleteApprovalRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    type: Literal["schedule_delete_approval"]
    action: Literal["delete_schedule"]
    message: str
    schedule: ScheduleDeleteApprovalTarget

AgentApprovalRequest = Annotated[
    ExpenseUpdateApprovalRequest
    | ExpenseDeleteApprovalRequest
    | ScheduleUpdateApprovalRequest
    | ScheduleDeleteApprovalRequest,
    Field(discriminator="type"),
]

agent_approval_request_adapter = TypeAdapter(AgentApprovalRequest)

class ApproveDecision(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    action: Literal["approve"]
    expected_version: int | None = Field(default=None, gt=0, alias="expectedVersion")

class CancelDecision(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    action: Literal["cancel"]

class ReviseDecision(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    action: Literal["revise"]
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        nomalized = value.strip()
        if not nomalized:
            raise ValueError("수정 요청 내용을 입력해야 합니다.")
        return nomalized

UpdateExpenseDecision = Annotated[
    ApproveDecision | CancelDecision | ReviseDecision,
    Field(discriminator="action"),
]

UpdateScheduleDecision = UpdateExpenseDecision
AgentApprovalDecision = UpdateExpenseDecision

agent_approval_decision_adapter = TypeAdapter(AgentApprovalDecision)

class AgentApprovalResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    room_id: int = Field(gt=0, alias="roomId")
    user_message_id: int = Field(gt=0, alias="userMessageId")
    approval_id: UUID4 = Field(alias="approvalId")
    action: Literal["approve", "cancel"]

class ApprovalIntent(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )

    intent: Literal[
        "approve",
        "cancel",
        "revise",
        "unclear",
    ] = Field(
        description=(
            "현재 승인 제안을 그대로 실행하면 approve, "
            "취소하면 cancel, 내용을 변경하면 revise, "
            "의미가 불명확하면 unclear"
        ),
    )