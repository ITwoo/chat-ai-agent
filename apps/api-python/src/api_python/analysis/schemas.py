from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SpendingSummaryRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    user_id: int = Field(
        serialization_alias="userId",
    )
    start_date: str = Field(
        serialization_alias="startDate",
    )
    end_date: str = Field(
        serialization_alias="endDate",
    )
    category: str | None = None


class CategorySummary(BaseModel):
    category: str
    amount: int
    count: int
    percentage: float


class SpendingSummaryResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    total_amount: int = Field(
        alias="totalAmount",
    )
    count: int
    average_amount: float = Field(
        alias="averageAmount",
    )
    top_category: str | None = Field(
        alias="topCategory",
    )
    categories: list[CategorySummary]


class SpendingComparisonRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    user_id: int = Field(
        serialization_alias="userId",
    )
    current_start_date: str = Field(
        serialization_alias="currentStartDate",
    )
    current_end_date: str = Field(
        serialization_alias="currentEndDate",
    )
    previous_start_date: str = Field(
        serialization_alias="previousStartDate",
    )
    previous_end_date: str = Field(
        serialization_alias="previousEndDate",
    )


class CategoryComparison(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    category: str
    current_amount: int = Field(
        alias="currentAmount",
    )
    previous_amount: int = Field(
        alias="previousAmount",
    )
    difference: int
    change_rate: float | None = Field(
        alias="changeRate",
    )


class SpendingComparisonResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    current_total_amount: int = Field(
        alias="currentTotalAmount",
    )
    previous_total_amount: int = Field(
        alias="previousTotalAmount",
    )
    difference: int
    change_rate: float | None = Field(
        alias="changeRate",
    )
    categories: list[CategoryComparison]


class SpendingTrendRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    user_id: int = Field(
        serialization_alias="userId",
    )
    start_date: str = Field(
        serialization_alias="startDate",
    )
    end_date: str = Field(
        serialization_alias="endDate",
    )
    category: str | None = None
    granularity: Literal["day", "month"]


class SpendingTrendPoint(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    period: str
    amount: int
    count: int
    change_rate: float | None = Field(
        alias="changeRate",
    )
    moving_average: float = Field(
        alias="movingAverage",
    )


class SpendingTrendResponse(BaseModel):
    granularity: Literal[
        "day",
        "month",
    ]
    points: list[SpendingTrendPoint]


class SpendingAnomalyRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    user_id: int = Field(
        serialization_alias="userId",
    )
    start_date: str = Field(
        serialization_alias="startDate",
    )
    end_date: str = Field(
        serialization_alias="endDate",
    )
    category: str | None = None
    threshold: float | None = None


class SpendingAnomaly(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    id: int
    title: str
    category: str
    amount: int
    spent_at: str = Field(
        alias="spentAt",
    )
    category_average: float = Field(
        alias="categoryAverage",
    )
    z_score: float | None = Field(
        alias="zScore",
    )


class SpendingAnomalyResponse(BaseModel):
    threshold: float
    anomalies: list[SpendingAnomaly]


class SpendingForecastRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    user_id: int = Field(
        serialization_alias="userId",
    )
    as_of_date: str = Field(
        serialization_alias="asOfDate",
    )
    category: str | None = None


class SpendingForecastResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    current_amount: int = Field(
        alias="currentAmount",
    )
    forecast_amount: int = Field(
        alias="forecastAmount",
    )
    daily_average: float = Field(
        alias="dailyAverage",
    )
    days_in_month: int = Field(
        alias="daysInMonth",
    )
    elapsed_days: float = Field(
        alias="elapsedDays",
    )
    remaining_days: float = Field(
        alias="remainingDays",
    )
    method: Literal[
        "daily_average",
        "ridge_recursive",
    ]