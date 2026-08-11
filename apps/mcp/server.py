from statistics import quantiles
from typing import Annotated

from mcp.server import MCPServer
from pydantic import BaseModel, Field


mcp = MCPServer("chat-ai-agent-mcp")


class ExpenseInput(BaseModel):
    id: int = Field(gt=0, description="지출 고유 ID")
    amount: int = Field(gt=0, description="지출 금액")
    category: str = Field(min_length=1, description="지출 카테고리")
    title: str = Field(min_length=1, description="지출 제목")


class ExpenseAnomaly(BaseModel):
    id: int
    amount: int
    category: str
    title: str


class ExpenseAnomalyResult(BaseModel):
    sample_count: int
    q1: float
    q3: float
    iqr: float
    upper_fence: float
    anomalies: list[ExpenseAnomaly]


ExpenseList = Annotated[
    list[ExpenseInput],
    Field(min_length=4, max_length=50, description="분석할 지출 목록"),
]


@mcp.tool()
def analyze_expense_anomalies(expenses: ExpenseList) -> ExpenseAnomalyResult:
    """지출 금액 분포를 분석해 평소보다 큰 상위 이상 지출을 탐지한다."""
    amounts = [expense.amount for expense in expenses]
    q1, _, q3 = quantiles(amounts, n=4, method="inclusive")

    iqr = q3 - q1
    upper_fence = q3 + 1.5 * iqr

    anomalies = [
        ExpenseAnomaly(
            id=expense.id,
            amount=expense.amount,
            category=expense.category,
            title=expense.title,
        )
        for expense in expenses
        if expense.amount > upper_fence
    ]

    anomalies.sort(key=lambda expense: expense.amount, reverse=True)

    return ExpenseAnomalyResult(
        sample_count=len(expenses),
        q1=q1,
        q3=q3,
        iqr=iqr,
        upper_fence=upper_fence,
        anomalies=anomalies,
    )


def main() -> None:
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=8000,
        stateless_http=True,
        json_response=True,
    )


if __name__ == "__main__":
    main()