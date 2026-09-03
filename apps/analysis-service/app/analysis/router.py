from fastapi import APIRouter

from app.analysis.schemas import (
    SpendingComparisonRequest,
    SpendingComparisonResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
)
from app.analysis.service import analyze_spending_summary
from app.analysis.service import (
    analyze_spending_comparison,
    analyze_spending_summary,
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