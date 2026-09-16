
from argparse import ArgumentParser
from datetime import datetime, timedelta
import json

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.db.postgres import pool

CATEGORICAL_FEATURES = [
    "day_of_week",
]

NUMERIC_FEATURES = [
    "day_of_month",
    "recent_7d_average",
    "last_week_same_day",
]

FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES

MIN_ML_FORECAST_SAMPLES = 60

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

def load_daily_spending(
    user_id: int,
    start_date: datetime,
    end_date: datetime,
    category: str | None = None,
) -> pd.DataFrame:
    return _load_daily_spending(
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        category=category,
    )


def has_enough_ml_forecast_samples(
    daily: pd.DataFrame,
    as_of_date: datetime,
    min_samples: int,
) -> bool:
    today = pd.Timestamp(as_of_date).tz_localize(None).normalize()

    complete_history = (
        daily.loc[daily["date"] < today]
        .copy()
        .sort_values("date")
        .reset_index(drop=True)
    )

    dataset = _build_dataset(complete_history)

    return len(dataset) >= min_samples

def _build_ridge_model(alpha: float = 1.0) -> Pipeline:
    preprocessor = ColumnTransformer([
        (
            "categorical",
            OneHotEncoder(
                drop="first",
                handle_unknown="ignore",
                sparse_output=False,
            ),
            CATEGORICAL_FEATURES,
        ),
        (
            "numeric",
            StandardScaler(),
            NUMERIC_FEATURES,
        ),
    ])

    return Pipeline([
        ("preprocessor", preprocessor),
        ("ridge", Ridge(alpha=alpha)),
    ])

def _build_feature_row(history: pd.DataFrame, target_date: pd.Timestamp) -> pd.DataFrame:
    recent_7d = history.tail(7)["amount"]

    if len(recent_7d) < 7:
        raise ValueError("At least 7 days of history are required")

    last_week_date = target_date - pd.Timedelta(days=7)
    last_week = history.loc[history["date"] == last_week_date, "amount"]

    if last_week.empty:
        raise ValueError(f"Missing lag-7 data for {target_date.date()}")

    day_of_week = target_date.dayofweek

    return pd.DataFrame([{
        "day_of_week": day_of_week,
        "day_of_month": target_date.day,
        "recent_7d_average": float(recent_7d.mean()),
        "last_week_same_day": float(last_week.iloc[0]),
    }])

def _forecast_future_days(
    model: Pipeline,
    history: pd.DataFrame,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
) -> pd.DataFrame:
    forecast_history = history.copy()
    predictions: list[dict[str, object]] = []

    target_date = start_date

    while target_date < end_date:
        X = _build_feature_row(forecast_history, target_date)

        predicted_amount = max(float(model.predict(X)[0]), 0)

        predictions.append({
            "date": target_date,
            "amount": predicted_amount,
        })

        forecast_history = pd.concat([
            forecast_history,
            pd.DataFrame([{
                "date": target_date,
                "amount": predicted_amount,
            }]),
        ], ignore_index=True)

        target_date += pd.Timedelta(days=1)

    return pd.DataFrame(predictions)

def _forecast_month_end_with_daily_average(
    daily: pd.DataFrame,
    as_of_date: pd.Timestamp,
) -> float:
    as_of = pd.Timestamp(as_of_date).tz_localize(None).normalize()
    month_start = as_of.replace(day=1)

    current_amount = float(
        daily.loc[
            (daily["date"] >= month_start)
            & (daily["date"] <= as_of),
            "amount",
        ].sum()
    )

    daily_average = current_amount / as_of.day

    return daily_average * as_of.days_in_month

def forecast_month_end_with_ridge(
    daily: pd.DataFrame,
    as_of_date: datetime,
    alpha: float = 1.0,
) -> dict[str, object]:
    as_of = pd.Timestamp(as_of_date).tz_localize(None).normalize()

    history = (
        daily.loc[daily["date"] <= as_of]
        .copy()
        .sort_values("date")
        .reset_index(drop=True)
    )

    dataset = _build_dataset(history)

    if len(dataset) < 30:
        raise ValueError(
            f"Not enough samples for ML forecast: {len(dataset)}. At least 30 are required."
        )

    X = dataset[FEATURES]
    y = dataset["amount"]

    model = _build_ridge_model(alpha=alpha)

    model.fit(X, y)

    next_date = as_of + pd.Timedelta(days=1)
    month_end = as_of + pd.offsets.MonthBegin(1)

    future = _forecast_future_days(model, history, next_date, month_end)

    month_start = as_of.replace(day=1)

    current_amount = float(
        history.loc[
            (history["date"] >= month_start)
            & (history["date"] <= as_of),
            "amount",
        ].sum()
    )

    future_amount = float(future["amount"].sum()) if not future.empty else 0.0

    return {
        "currentAmount": round(current_amount, 2),
        "predictedRemainingAmount": round(future_amount, 2),
        "forecastAmount": round(current_amount + future_amount, 2),
        "predictedDays": len(future),
        "method": "ridge_recursive",
    }

def forecast_month_end_live_with_ridge(
    daily: pd.DataFrame,
    as_of_date: datetime,
    alpha: float = 1.0,
) -> dict[str, object]:
    as_of = pd.Timestamp(as_of_date).tz_localize(None)
    today = as_of.normalize()

    complete_history = (
        daily.loc[daily["date"] < today]
        .copy()
        .sort_values("date")
        .reset_index(drop=True)
    )

    dataset = _build_dataset(complete_history)

    if len(dataset) < 30:
        raise ValueError(
            f"Not enough samples for ML forecast: {len(dataset)}. At least 30 are required."
        )

    model = _build_ridge_model(alpha=alpha)
    model.fit(dataset[FEATURES], dataset["amount"])

    today_feature = _build_feature_row(
        complete_history,
        today,
    )

    predicted_today_amount = max(
        float(model.predict(today_feature)[0]),
        0,
    )

    today_actual = daily.loc[
        daily["date"] == today,
        "amount",
    ]

    current_today_amount = (
        float(today_actual.iloc[0])
        if not today_actual.empty
        else 0.0
    )

    predicted_today_remaining = max(
        predicted_today_amount - current_today_amount,
        0,
    )

    forecast_history = pd.concat([
        complete_history,
        pd.DataFrame([{
            "date": today,
            "amount": predicted_today_amount,
        }]),
    ], ignore_index=True)

    tomorrow = today + pd.Timedelta(days=1)
    month_end = today + pd.offsets.MonthBegin(1)

    future = _forecast_future_days(
        model,
        forecast_history,
        tomorrow,
        month_end,
    )

    month_start = today.replace(day=1)

    current_amount = float(
        daily.loc[
            (daily["date"] >= month_start)
            & (daily["date"] <= today),
            "amount",
        ].sum()
    )

    future_days_amount = (
        float(future["amount"].sum())
        if not future.empty
        else 0.0
    )

    predicted_remaining_amount = (
        predicted_today_remaining
        + future_days_amount
    )

    return {
        "currentAmount": round(current_amount, 2),
        "predictedRemainingAmount": round(
            predicted_remaining_amount,
            2,
        ),
        "forecastAmount": round(
            current_amount + predicted_remaining_amount,
            2,
        ),
        "predictedTodayAmount": round(
            predicted_today_amount,
            2,
        ),
        "predictedDays": len(future) + 1,
        "method": "ridge_recursive",
    }

def forecast_month_end_with_fallback(
    daily: pd.DataFrame,
    as_of_date: datetime,
    *,
    ml_enabled: bool,
    alpha: float,
    min_samples: int = MIN_ML_FORECAST_SAMPLES,
) -> dict[str, object]:
    as_of = pd.Timestamp(as_of_date).tz_localize(None).normalize()

    history = (
        daily.loc[daily["date"] <= as_of]
        .copy()
        .sort_values("date")
        .reset_index(drop=True)
    )

    dataset = _build_dataset(history)

    if ml_enabled and len(dataset) >= min_samples:
        return forecast_month_end_with_ridge(
            daily=daily,
            as_of_date=as_of_date,
            alpha=alpha,
        )

    month_start = as_of.replace(day=1)

    current_amount = float(
        history.loc[
            (history["date"] >= month_start)
            & (history["date"] <= as_of),
            "amount",
        ].sum()
    )

    forecast_amount = _forecast_month_end_with_daily_average(
        daily=daily,
        as_of_date=as_of,
    )

    return {
        "currentAmount": round(current_amount, 2),
        "forecastAmount": round(forecast_amount, 2),
        "predictedRemainingAmount": round(
            max(forecast_amount - current_amount, 0),
            2,
        ),
        "predictedDays": max(as_of.days_in_month - as_of.day, 0),
        "method": "daily_average",
    }

def backtest_month_end_forecast(
    daily: pd.DataFrame,
    start_date: datetime,
    end_date: datetime,
    forecast_day: int = 10,
    alpha: float = 1.0,
) -> dict[str, object]:
    if not 1 <= forecast_day <= 28:
        raise ValueError("forecast_day must be between 1 and 28")

    start = pd.Timestamp(start_date).tz_localize(None)
    end = pd.Timestamp(end_date).tz_localize(None)

    month_starts = pd.date_range(
        start=start.replace(day=1),
        end=end,
        freq="MS",
    )

    results: list[dict[str, object]] = []

    for month_start in month_starts:
        next_month_start = month_start + pd.offsets.MonthBegin(1)

        if next_month_start > end:
            continue

        as_of = month_start + pd.Timedelta(days=forecast_day - 1)

        history = daily.loc[daily["date"] <= as_of]

        if len(_build_dataset(history)) < 30:
            continue

        actual_amount = float(
            daily.loc[
                (daily["date"] >= month_start)
                & (daily["date"] < next_month_start),
                "amount",
            ].sum()
        )

        baseline_forecast = _forecast_month_end_with_daily_average(
            daily,
            as_of,
        )

        ridge_result = forecast_month_end_with_ridge(
            daily,
            as_of.to_pydatetime(),
            alpha=alpha,
        )

        ridge_forecast = float(ridge_result["forecastAmount"])

        baseline_error = abs(actual_amount - baseline_forecast)
        ridge_error = abs(actual_amount - ridge_forecast)

        results.append({
            "month": month_start.strftime("%Y-%m"),
            "asOfDate": as_of.strftime("%Y-%m-%d"),
            "actualAmount": round(actual_amount, 2),
            "baselineForecast": round(baseline_forecast, 2),
            "ridgeForecast": round(ridge_forecast, 2),
            "baselineError": round(baseline_error, 2),
            "ridgeError": round(ridge_error, 2),
            "ridgeBetter": ridge_error < baseline_error,
        })

    if not results:
        raise ValueError("No months available for month-end backtesting")

    actual = [float(row["actualAmount"]) for row in results]
    baseline = [float(row["baselineForecast"]) for row in results]
    ridge = [float(row["ridgeForecast"]) for row in results]

    baseline_mae = float(mean_absolute_error(actual, baseline))
    ridge_mae = float(mean_absolute_error(actual, ridge))

    improvement_rate = (
        (baseline_mae - ridge_mae) / baseline_mae * 100
        if baseline_mae > 0
        else None
    )

    return {
        "forecastDay": forecast_day,
        "alpha": alpha,
        "evaluatedMonths": len(results),
        "baselineMae": round(baseline_mae, 2),
        "ridgeMae": round(ridge_mae, 2),
        "improvementRate": (
            None
            if improvement_rate is None
            else round(improvement_rate, 2)
        ),
        "ridgeBetter": ridge_mae < baseline_mae,
        "months": results,
    }

def tune_ridge_alpha(
    daily: pd.DataFrame,
    start_date: datetime,
    end_date: datetime,
    forecast_day: int = 10,
    alphas: tuple[float, ...] = (0.01, 0.1, 1.0, 10.0, 100.0),
) -> dict[str, object]:
    evaluations: list[dict[str, object]] = []

    for alpha in alphas:
        result = backtest_month_end_forecast(
            daily=daily,
            start_date=start_date,
            end_date=end_date,
            forecast_day=forecast_day,
            alpha=alpha,
        )

        evaluations.append({
            "alpha": alpha,
            "ridgeMae": result["ridgeMae"],
            "baselineMae": result["baselineMae"],
            "improvementRate": result["improvementRate"],
        })

    best = min(
        evaluations,
        key=lambda evaluation: float(evaluation["ridgeMae"]),
    )

    return {
        "bestAlpha": best["alpha"],
        "bestRidgeMae": best["ridgeMae"],
        "evaluations": evaluations,
    }

def evaluate_ridge_validation_test(
    daily: pd.DataFrame,
    start_date: datetime,
    split_date: datetime,
    end_date: datetime,
    forecast_day: int = 10,
    alphas: tuple[float, ...] = (0.01, 0.1, 1.0, 10.0, 100.0),
) -> dict[str, object]:
    start = pd.Timestamp(start_date).tz_localize(None)
    split = pd.Timestamp(split_date).tz_localize(None)
    end = pd.Timestamp(end_date).tz_localize(None)

    if not start < split < end:
        raise ValueError("start_date < split_date < end_date must be satisfied")

    if split.day != 1:
        raise ValueError("split_date must be the first day of a month")

    validation = tune_ridge_alpha(
        daily=daily,
        start_date=start.to_pydatetime(),
        end_date=split.to_pydatetime(),
        forecast_day=forecast_day,
        alphas=alphas,
    )

    best_alpha = float(validation["bestAlpha"])

    test = backtest_month_end_forecast(
        daily=daily,
        start_date=split.to_pydatetime(),
        end_date=end.to_pydatetime(),
        forecast_day=forecast_day,
        alpha=best_alpha,
    )

    return {
        "validationPeriod": {
            "startDate": start.strftime("%Y-%m-%d"),
            "endDate": split.strftime("%Y-%m-%d"),
        },
        "testPeriod": {
            "startDate": split.strftime("%Y-%m-%d"),
            "endDate": end.strftime("%Y-%m-%d"),
        },
        "selectedAlpha": best_alpha,
        "validation": validation,
        "test": test,
    }
    
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

    model = _build_ridge_model(alpha=1.0)

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

    preprocessor = model.named_steps["preprocessor"]
    ridge = model.named_steps["ridge"]

    feature_names = preprocessor.get_feature_names_out()

    coefficients = {
        feature: round(float(coefficient), 2)
        for feature, coefficient in zip(feature_names, ridge.coef_, strict=True)
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

    parser.add_argument(
        "--mode",
        choices=["daily", "month-end", "tune", "final"],
        default="daily",
    )
    parser.add_argument("--forecast-day", type=int, default=10)
    parser.add_argument("--split-date")

    args = parser.parse_args()

    pool.open()

    try:
        start_date = datetime.fromisoformat(args.start_date)
        end_date = datetime.fromisoformat(args.end_date)

        daily = _load_daily_spending(
            user_id=args.user_id,
            start_date=start_date,
            end_date=end_date,
            category=args.category,
        )

        if args.mode == "final":
            if args.split_date is None:
                parser.error("--split-date is required when --mode final")

            result = evaluate_ridge_validation_test(
                daily=daily,
                start_date=start_date,
                split_date=datetime.fromisoformat(args.split_date),
                end_date=end_date,
                forecast_day=args.forecast_day,
            )

        elif args.mode == "tune":
            result = tune_ridge_alpha(
                daily=daily,
                start_date=start_date,
                end_date=end_date,
                forecast_day=args.forecast_day,
            )
        elif args.mode == "month-end":
            result = backtest_month_end_forecast(
                daily=daily,
                start_date=start_date,
                end_date=end_date,
                forecast_day=args.forecast_day,
            )
        else:
            result = evaluate_spending_daily_forecast(
                user_id=args.user_id,
                start_date=start_date,
                end_date=end_date,
                category=args.category,
            )
    finally:
        pool.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
