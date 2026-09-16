
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import main
from app.analysis import router as analysis_router
from app.analysis.schemas import SpendingForecastResponse


def test_spending_forecast_api_returns_ridge_response(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        main.pool,
        "open",
        MagicMock(),
    )
    monkeypatch.setattr(
        main.pool,
        "close",
        MagicMock(),
    )

    analyze_forecast = MagicMock(
        return_value=SpendingForecastResponse(
            currentAmount=300_000,
            forecastAmount=650_000,
            dailyAverage=20_000.0,
            daysInMonth=30,
            elapsedDays=15.5,
            remainingDays=14.5,
            method="ridge_recursive",
        )
    )

    monkeypatch.setattr(
        analysis_router,
        "analyze_spending_forecast",
        analyze_forecast,
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/analysis/spending/forecast",
            json={
                "userId": 1,
                "asOfDate": "2026-09-16T12:00:00",
            },
        )

    assert response.status_code == 200

    assert response.json() == {
        "currentAmount": 300_000,
        "forecastAmount": 650_000,
        "dailyAverage": 20_000.0,
        "daysInMonth": 30,
        "elapsedDays": 15.5,
        "remainingDays": 14.5,
        "method": "ridge_recursive",
    }

    analyze_forecast.assert_called_once()


def test_spending_forecast_api_rejects_invalid_user_id(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        main.pool,
        "open",
        MagicMock(),
    )
    monkeypatch.setattr(
        main.pool,
        "close",
        MagicMock(),
    )

    analyze_forecast = MagicMock()

    monkeypatch.setattr(
        analysis_router,
        "analyze_spending_forecast",
        analyze_forecast,
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/analysis/spending/forecast",
            json={
                "userId": 0,
                "asOfDate": "2026-09-16T12:00:00",
            },
        )

    assert response.status_code == 422

    analyze_forecast.assert_not_called()
