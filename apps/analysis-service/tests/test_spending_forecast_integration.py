
import os

import pytest
from fastapi.testclient import TestClient

from app import main
from app.analysis import service


RUN_INTEGRATION = (
    os.getenv("RUN_ANALYSIS_INTEGRATION", "").lower() == "true"
)

USER_ID = os.getenv("ANALYSIS_INTEGRATION_USER_ID")
AS_OF_DATE = os.getenv("ANALYSIS_INTEGRATION_AS_OF_DATE")


@pytest.mark.skipif(
    not RUN_INTEGRATION,
    reason="RUN_ANALYSIS_INTEGRATION=true is required",
)
def test_spending_forecast_uses_ridge_with_real_database(
    monkeypatch,
) -> None:
    if USER_ID is None:
        pytest.fail(
            "ANALYSIS_INTEGRATION_USER_ID is required"
        )

    if AS_OF_DATE is None:
        pytest.fail(
            "ANALYSIS_INTEGRATION_AS_OF_DATE is required"
        )

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

    with TestClient(main.app) as client:
        response = client.post(
            "/analysis/spending/forecast",
            json={
                "userId": int(USER_ID),
                "asOfDate": AS_OF_DATE,
            },
        )

    assert response.status_code == 200, response.text

    body = response.json()

    assert body["method"] == "ridge_recursive", (
        "Ridge가 사용되지 않았습니다. "
        "해당 userId의 완료된 일별 학습 sample이 "
        "60개 이상인지 확인하세요."
    )

    assert body["forecastAmount"] >= body["currentAmount"]
    assert body["dailyAverage"] >= 0
    assert body["daysInMonth"] in (28, 29, 30, 31)
    assert body["remainingDays"] >= 0
