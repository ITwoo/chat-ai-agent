import httpx

from api_python.analysis.schemas import (
    SpendingAnomalyRequest,
    SpendingAnomalyResponse,
    SpendingComparisonRequest,
    SpendingComparisonResponse,
    SpendingForecastRequest,
    SpendingForecastResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
    SpendingTrendRequest,
    SpendingTrendResponse,
)
from api_python.config import settings


class AnalysisClientError(RuntimeError):
    pass


class AnalysisClientService:
    def __init__(
        self,
        base_url: str | None = None,
    ) -> None:
        self._base_url = (
            base_url
            or settings.analysis_service_url
        ).rstrip("/")

    async def _post(
        self,
        path: str,
        request: object,
        response_type: type[
            SpendingSummaryResponse
            | SpendingComparisonResponse
            | SpendingTrendResponse
            | SpendingAnomalyResponse
            | SpendingForecastResponse
        ],
    ):
        async with httpx.AsyncClient(
            timeout=5.0,
        ) as client:
            response = await client.post(
                f"{self._base_url}{path}",
                json=request.model_dump(
                    by_alias=True,
                    exclude_none=True,
                ),
            )

        if response.is_error:
            raise AnalysisClientError(
                "Analysis Service 요청 실패: "
                f"{response.status_code} "
                f"{response.text}"
            )

        return response_type.model_validate(
            response.json()
        )

    async def get_spending_summary(
        self,
        request: SpendingSummaryRequest,
    ) -> SpendingSummaryResponse:
        return await self._post(
            "/analysis/spending/summary",
            request,
            SpendingSummaryResponse,
        )

    async def get_spending_comparison(
        self,
        request: SpendingComparisonRequest,
    ) -> SpendingComparisonResponse:
        return await self._post(
            "/analysis/spending/comparison",
            request,
            SpendingComparisonResponse,
        )

    async def get_spending_trend(
        self,
        request: SpendingTrendRequest,
    ) -> SpendingTrendResponse:
        return await self._post(
            "/analysis/spending/trend",
            request,
            SpendingTrendResponse,
        )

    async def get_spending_anomalies(
        self,
        request: SpendingAnomalyRequest,
    ) -> SpendingAnomalyResponse:
        return await self._post(
            "/analysis/spending/anomalies",
            request,
            SpendingAnomalyResponse,
        )

    async def get_spending_forecast(
        self,
        request: SpendingForecastRequest,
    ) -> SpendingForecastResponse:
        return await self._post(
            "/analysis/spending/forecast",
            request,
            SpendingForecastResponse,
        )


analysis_client_service = (
    AnalysisClientService()
)