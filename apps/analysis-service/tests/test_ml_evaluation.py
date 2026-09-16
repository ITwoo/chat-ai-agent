
from datetime import datetime

import pandas as pd

from app.analysis.ml_evaluation import evaluate_ridge_validation_test


def _build_weekday_pattern_daily() -> pd.DataFrame:
    dates = pd.date_range(
        start="2025-01-01",
        end="2026-08-31",
        freq="D",
    )

    amounts = [
        100_000.0 if date.dayofweek >= 5 else 10_000.0
        for date in dates
    ]

    return pd.DataFrame({
        "date": dates,
        "amount": amounts,
    })


def test_ridge_validation_test_with_synthetic_weekday_pattern() -> None:
    daily = _build_weekday_pattern_daily()

    result = evaluate_ridge_validation_test(
        daily=daily,
        start_date=datetime(2025, 1, 1),
        split_date=datetime(2026, 5, 1),
        end_date=datetime(2026, 9, 1),
        forecast_day=10,
    )

    assert result["validationPeriod"] == {
        "startDate": "2025-01-01",
        "endDate": "2026-05-01",
    }

    assert result["testPeriod"] == {
        "startDate": "2026-05-01",
        "endDate": "2026-09-01",
    }

    assert result["selectedAlpha"] in (
        0.01,
        0.1,
        1.0,
        10.0,
        100.0,
    )

    assert len(result["validation"]["evaluations"]) == 5

    test_result = result["test"]

    assert test_result["evaluatedMonths"] == 4
    assert test_result["ridgeBetter"] is True
    assert test_result["ridgeMae"] < test_result["baselineMae"]
