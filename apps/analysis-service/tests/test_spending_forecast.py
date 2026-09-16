
from datetime import datetime
from unittest.mock import MagicMock

import pandas as pd

from app.analysis import service
from app.analysis.schemas import SpendingForecastRequest


AS_OF_DATE = datetime(2026, 9, 16, 12, 0)
FIRST_SPENT_AT = datetime(2026, 1, 1)


def _mock_forecast_db(
    monkeypatch,
    current_amount: int = 300_000,
) -> None:
    cursor = MagicMock()

    cursor.fetchone.side_effect = [
        (current_amount,),
        (FIRST_SPENT_AT,),
    ]

    cursor_context = MagicMock()
    cursor_context.__enter__.return_value = cursor

    connection = MagicMock()
    connection.cursor.return_value = cursor_context

    connection_context = MagicMock()
    connection_context.__enter__.return_value = connection

    monkeypatch.setattr(
        service.pool,
        "connection",
        MagicMock(return_value=connection_context),
    )


def _request() -> SpendingForecastRequest:
    return SpendingForecastRequest(
        userId=1,
        asOfDate=AS_OF_DATE,
    )


def test_forecast_uses_daily_average_when_ml_disabled(
    monkeypatch,
) -> None:
    _mock_forecast_db(monkeypatch)

    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_enabled",
        False,
    )

    load_daily = MagicMock()

    monkeypatch.setattr(
        service,
        "load_daily_spending",
        load_daily,
    )

    result = service.analyze_spending_forecast(_request())

    assert result.method == "daily_average"
    assert result.current_amount == 300_000

    load_daily.assert_not_called()


def test_forecast_falls_back_when_ml_samples_are_insufficient(
    monkeypatch,
) -> None:
    _mock_forecast_db(monkeypatch)

    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_enabled",
        True,
    )
    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_min_samples",
        60,
    )

    daily = pd.DataFrame({
        "date": pd.date_range("2026-09-01", periods=10),
        "amount": [10_000.0] * 10,
    })

    monkeypatch.setattr(
        service,
        "load_daily_spending",
        MagicMock(return_value=daily),
    )
    monkeypatch.setattr(
        service,
        "has_enough_ml_forecast_samples",
        MagicMock(return_value=False),
    )

    ridge_forecast = MagicMock()

    monkeypatch.setattr(
        service,
        "forecast_month_end_live_with_ridge",
        ridge_forecast,
    )

    result = service.analyze_spending_forecast(_request())

    assert result.method == "daily_average"

    ridge_forecast.assert_not_called()


def test_forecast_uses_ridge_when_ml_samples_are_sufficient(
    monkeypatch,
) -> None:
    _mock_forecast_db(monkeypatch)

    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_enabled",
        True,
    )
    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_min_samples",
        60,
    )
    monkeypatch.setattr(
        service.settings,
        "analysis_ml_forecast_alpha",
        0.1,
    )

    daily = pd.DataFrame({
        "date": pd.date_range("2026-01-01", periods=100),
        "amount": [10_000.0] * 100,
    })

    monkeypatch.setattr(
        service,
        "load_daily_spending",
        MagicMock(return_value=daily),
    )
    monkeypatch.setattr(
        service,
        "has_enough_ml_forecast_samples",
        MagicMock(return_value=True),
    )

    ridge_forecast = MagicMock(
        return_value={
            "forecastAmount": 650_000.0,
        }
    )

    monkeypatch.setattr(
        service,
        "forecast_month_end_live_with_ridge",
        ridge_forecast,
    )

    result = service.analyze_spending_forecast(_request())

    assert result.method == "ridge_recursive"
    assert result.forecast_amount == 650_000

    ridge_forecast.assert_called_once_with(
        daily=daily,
        as_of_date=AS_OF_DATE,
        alpha=0.1,
    )
