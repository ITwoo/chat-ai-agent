
from argparse import ArgumentParser
from datetime import datetime
import json

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.db.postgres import pool


FEATURES = [
    "day_of_week",
    "is_weekend",
    "day_of_month",
    "recent_7d_average",
    "last_week_same_day",
]


def _load_daily_spending(
    user_id: int,
    start_date: datetime,
    end_date: datetime,
    category: str | None = None,
) -> pd.DataFrame:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            query = """
                SELECT
                    date_trunc('day', "spentAt") AS date,
                    SUM("amount") AS amount
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
            """
            params = [user_id, start_date, end_date]

            if category is not None:
                query += ' AND "category" = %s'
                params.append(category)

            query += """
                GROUP BY date
                ORDER BY date
            """

            cursor.execute(query, params)
            rows = cursor.fetchall()

    start = pd.Timestamp(start_date).tz_localize(None).normalize()
    end = pd.Timestamp(end_date).tz_localize(None)
    end_period = end.normalize()

    if end != end_period:
        end_period += pd.Timedelta(days=1)

    daily = pd.DataFrame({
        "date": pd.date_range(start=start, end=end_period, freq="D", inclusive="left"),
    })

    actual = pd.DataFrame(rows, columns=["date", "amount"])

    if not actual.empty:
        actual["date"] = pd.to_datetime(actual["date"])
        actual["amount"] = pd.to_numeric(actual["amount"])

    daily = daily.merge(actual, on="date", how="left")
    daily["amount"] = daily["amount"].fillna(0).astype("float64")

    return daily


def _build_dataset(daily: pd.DataFrame) -> pd.DataFrame:
    dataset = daily.copy()

    dataset["day_of_week"] = dataset["date"].dt.dayofweek
    dataset["is_weekend"] = (dataset["day_of_week"] >= 5).astype(int)
    dataset["day_of_month"] = dataset["date"].dt.day

    dataset["recent_7d_average"] = (
        dataset["amount"]
        .shift(1)
        .rolling(window=7, min_periods=7)
        .mean()
    )

    dataset["last_week_same_day"] = dataset["amount"].shift(7)

    return (
        dataset
        .dropna(subset=FEATURES)
        .sort_values("date")
        .reset_index(drop=True)
    )


def evaluate_spending_daily_forecast(
    user_id: int,
    start_date: datetime,
    end_date: datetime,
    category: str | None = None,
) -> dict[str, object]:
    if start_date >= end_date:
        raise ValueError("start_date must be earlier than end_date")

    daily = _load_daily_spending(user_id, start_date, end_date, category)
    dataset = _build_dataset(daily)

    if len(dataset) < 30:
        raise ValueError(
            f"Not enough samples for evaluation: {len(dataset)}. At least 30 are required."
        )

    split_index = int(len(dataset) * 0.8)

    train = dataset.iloc[:split_index]
    test = dataset.iloc[split_index:]

    X_train = train[FEATURES]
    y_train = train["amount"]

    X_test = test[FEATURES]
    y_test = test["amount"]

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=1.0)),
    ])

    model.fit(X_train, y_train)

    ridge_predictions = np.maximum(model.predict(X_test), 0)
    baseline_predictions = test["recent_7d_average"].to_numpy()

    ridge_mae = float(mean_absolute_error(y_test, ridge_predictions))
    baseline_mae = float(mean_absolute_error(y_test, baseline_predictions))

    improvement_rate = (
        (baseline_mae - ridge_mae) / baseline_mae * 100
        if baseline_mae > 0
        else None
    )

    ridge = model.named_steps["ridge"]

    coefficients = {
        feature: round(float(coefficient), 2)
        for feature, coefficient in zip(FEATURES, ridge.coef_, strict=True)
    }

    return {
        "totalSamples": len(dataset),
        "trainSamples": len(train),
        "testSamples": len(test),
        "ridgeMae": round(ridge_mae, 2),
        "baselineMae": round(baseline_mae, 2),
        "improvementRate": (
            None
            if improvement_rate is None
            else round(improvement_rate, 2)
        ),
        "ridgeBetter": ridge_mae < baseline_mae,
        "coefficients": coefficients,
        "intercept": round(float(ridge.intercept_), 2),
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--category")

    args = parser.parse_args()

    pool.open()

    try:
        result = evaluate_spending_daily_forecast(
            user_id=args.user_id,
            start_date=datetime.fromisoformat(args.start_date),
            end_date=datetime.fromisoformat(args.end_date),
            category=args.category,
        )
    finally:
        pool.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
