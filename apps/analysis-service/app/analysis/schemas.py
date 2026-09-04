from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SpendingSummaryRequest(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    user_id: int = Field(alias="userId", gt=0)
    start_date: datetime = Field(alias="startDate")
    end_date: datetime = Field(alias="endDate")
    category: str | None = None
    
    @model_validator(mode="after")
    def validate_period(self):
        if self.start_date >= self.end_date:
            raise ValueError("startDate must be earlier than endDate")

        return self


class CategorySummary(BaseModel):
    category: str
    amount: int
    count: int
    percentage: float


class SpendingSummaryResponse(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    total_amount: int = Field(alias="totalAmount")
    count: int
    average_amount: float = Field(alias="averageAmount")
    top_category: str | None = Field(alias="topCategory")
    categories: list[CategorySummary]

class SpendingComparisonRequest(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    user_id: int = Field(alias="userId", gt=0)
    current_start_date: datetime = Field(alias="currentStartDate")
    current_end_date: datetime = Field(alias="currentEndDate")
    previous_start_date: datetime = Field(alias="previousStartDate")
    previous_end_date: datetime = Field(alias="previousEndDate")

    @model_validator(mode="after")
    def validate_periods(self):
        if self.current_start_date >= self.current_end_date:
            raise ValueError(
                "currentStartDate must be earlier than currentEndDate"
            )

        if self.previous_start_date >= self.previous_end_date:
            raise ValueError(
                "previousStartDate must be earlier than previousEndDate"
            )

        return self


class CategoryComparison(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    category: str
    current_amount: int = Field(alias="currentAmount")
    previous_amount: int = Field(alias="previousAmount")
    difference: int
    change_rate: float | None = Field(alias="changeRate")


class SpendingComparisonResponse(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    current_total_amount: int = Field(alias="currentTotalAmount")
    previous_total_amount: int = Field(alias="previousTotalAmount")
    difference: int
    change_rate: float | None = Field(alias="changeRate")
    categories: list[CategoryComparison]

class SpendingTrendRequest(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    user_id: int = Field(alias="userId", gt=0)
    start_date: datetime = Field(alias="startDate")
    end_date: datetime = Field(alias="endDate")
    category: str | None = None
    granularity: Literal["day", "month"] = "day"

    @model_validator(mode="after")
    def validate_period(self):
        if self.start_date >= self.end_date:
            raise ValueError("startDate must be earlier than endDate")

        return self

class SpendingTrendPoint(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    period: datetime
    amount: int
    count: int
    change_rate: float | None = Field(alias="changeRate")
    moving_average: float = Field(alias="movingAverage")


class SpendingTrendResponse(BaseModel):
    granularity: Literal["day", "month"]
    points: list[SpendingTrendPoint]

class SpendingAnomalyRequest(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    user_id: int = Field(alias="userId", gt=0)
    start_date: datetime = Field(alias="startDate")
    end_date: datetime = Field(alias="endDate")
    category: str | None = None
    threshold: float = Field(default=2.0, gt=0)

    @model_validator(mode="after")
    def validate_period(self):
        if self.start_date >= self.end_date:
            raise ValueError("startDate must be earlier than endDate")

        return self


class SpendingAnomaly(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    id: int
    title: str
    category: str
    amount: int
    spent_at: datetime = Field(alias="spentAt")
    category_average: float = Field(alias="categoryAverage")
    z_score: float | None = Field(alias="zScore")


class SpendingAnomalyResponse(BaseModel):
    threshold: float
    anomalies: list[SpendingAnomaly]

class SpendingForecastRequest(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    user_id: int = Field(alias="userId", gt=0)
    as_of_date: datetime = Field(alias="asOfDate")
    category: str | None = None


class SpendingForecastResponse(BaseModel):
    model_config = ConfigDict(
        validate_by_name=True,
        validate_by_alias=True,
    )

    current_amount: int = Field(alias="currentAmount")
    forecast_amount: int = Field(alias="forecastAmount")
    daily_average: float = Field(alias="dailyAverage")
    days_in_month: int = Field(alias="daysInMonth")
    elapsed_days: float = Field(alias="elapsedDays")
    remaining_days: float = Field(alias="remainingDays")
    method: Literal["daily_average"]