from fastapi import APIRouter

from app.analysis.schemas import (
    SpendingComparisonRequest,
    SpendingComparisonResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
    SpendingTrendRequest,
    SpendingTrendResponse,
    SpendingAnomalyRequest,
    SpendingAnomalyResponse,
    SpendingForecastRequest,
    SpendingForecastResponse,
)
from app.analysis.service import (
    analyze_spending_comparison,
    analyze_spending_summary,
    analyze_spending_trend,
    analyze_spending_anomalies,
    analyze_spending_forecast,
)

router = APIRouter(
    prefix="/analysis/spending",
    tags=["spending-analysis"],
)


@router.post(
    "/summary",
    response_model=SpendingSummaryResponse,
)
def spending_summary(
    request: SpendingSummaryRequest,
) -> SpendingSummaryResponse:
    return analyze_spending_summary(request)

@router.post(
    "/comparison",
    response_model=SpendingComparisonResponse,
)
def spending_comparison(
    request: SpendingComparisonRequest,
) -> SpendingComparisonResponse:
    return analyze_spending_comparison(request)

@router.post(
    "/trend",
    response_model=SpendingTrendResponse,
)
def spending_trend(
    request: SpendingTrendRequest,
) -> SpendingTrendResponse:
    return analyze_spending_trend(request)

@router.post(
    "/anomalies",
    response_model=SpendingAnomalyResponse,
)
def spending_anomalies(
    request: SpendingAnomalyRequest,
) -> SpendingAnomalyResponse:
    return analyze_spending_anomalies(request)

@router.post(
    "/forecast",
    response_model=SpendingForecastResponse,
)
def spending_forecast(
    request: SpendingForecastRequest,
) -> SpendingForecastResponse:
    return analyze_spending_forecast(request)