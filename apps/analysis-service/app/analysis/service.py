import pandas as pd
from calendar import monthrange
from app.db.postgres import pool
from app.analysis.schemas import (
    CategoryComparison,
    CategorySummary,
    SpendingComparisonRequest,
    SpendingComparisonResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
    SpendingTrendPoint,
    SpendingTrendRequest,
    SpendingTrendResponse,
    SpendingAnomaly,
    SpendingAnomalyRequest,
    SpendingAnomalyResponse,
    SpendingForecastRequest,
    SpendingForecastResponse,
)

def _calculate_change_rate(
    current_amount: int,
    previous_amount: int,
) -> float | None:
    if previous_amount == 0:
        return None

    return round(
        (current_amount - previous_amount)
        / previous_amount
        * 100,
        1,
    )
    
def analyze_spending_summary(
    request: SpendingSummaryRequest,
) -> SpendingSummaryResponse:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            query = """
                SELECT
                    "category",
                    SUM("amount") AS total_amount,
                    COUNT(*) AS count
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
            """
            params = [
                request.user_id,
                request.start_date,
                request.end_date,
            ]

            if request.category is not None:
                query += ' AND "category" = %s'
                params.append(request.category)

            query += """
                GROUP BY "category"
                ORDER BY total_amount DESC
            """

            cursor.execute(query, params)

            rows = cursor.fetchall()

    if not rows:
        return SpendingSummaryResponse(
            total_amount=0,
            count=0,
            average_amount=0.0,
            top_category=None,
            categories=[],
        )

    total_amount = sum(row[1] for row in rows)
    count = sum(row[2] for row in rows)

    categories = [
        CategorySummary(
            category=category,
            amount=amount,
            count=category_count,
            percentage=round(amount / total_amount * 100, 1),
        )
        for category, amount, category_count in rows
    ]

    return SpendingSummaryResponse(
        total_amount=total_amount,
        count=count,
        average_amount=round(total_amount / count, 2),
        top_category=categories[0].category,
        categories=categories,
    )

def analyze_spending_comparison(
    request: SpendingComparisonRequest,
) -> SpendingComparisonResponse:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    'current' AS period,
                    "category",
                    SUM("amount") AS amount
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
                GROUP BY "category"

                UNION ALL

                SELECT
                    'previous' AS period,
                    "category",
                    SUM("amount") AS amount
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
                GROUP BY "category"
                """,
                (
                    request.user_id,
                    request.current_start_date,
                    request.current_end_date,
                    request.user_id,
                    request.previous_start_date,
                    request.previous_end_date,
                ),
            )

            rows = cursor.fetchall()

    if not rows:
        return SpendingComparisonResponse(
            current_total_amount=0,
            previous_total_amount=0,
            difference=0,
            change_rate=None,
            categories=[],
        )

    df = pd.DataFrame(
        rows,
        columns=["period", "category", "amount"],
    )    

    category_df = (
        df
        .pivot(
            index="category",
            columns="period",
            values="amount",
        )
        .fillna(0)
        .reset_index()
    )

    for period in ("current", "previous"):
        if period not in category_df.columns:
            category_df[period] = 0

    current_total = int(category_df["current"].sum())
    previous_total = int(category_df["previous"].sum())

    difference = current_total - previous_total

    change_rate = _calculate_change_rate(
        current_total,
        previous_total,
    )

    category_df["difference"] = (
        category_df["current"]
        - category_df["previous"]
    )

    categories = [
        CategoryComparison(
            category=row["category"],
            current_amount=int(row["current"]),
            previous_amount=int(row["previous"]),
            difference=int(row["difference"]),
            change_rate=_calculate_change_rate(
                int(row["current"]),
                int(row["previous"]),
            ),
        )
        for row in category_df.to_dict(orient="records")
    ]

    return SpendingComparisonResponse(
        current_total_amount=current_total,
        previous_total_amount=previous_total,
        difference=difference,
        change_rate=change_rate,
        categories=categories,
    )

def analyze_spending_trend(
    request: SpendingTrendRequest,
) -> SpendingTrendResponse:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            query = """
                SELECT
                    date_trunc(%s, "spentAt") AS period,
                    SUM("amount") AS amount,
                    COUNT(*) AS count
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
            """
            params = [
                request.granularity,
                request.user_id,
                request.start_date,
                request.end_date,
            ]

            if request.category is not None:
                query += ' AND "category" = %s'
                params.append(request.category)

            query += """
                GROUP BY period
                ORDER BY period
            """

            cursor.execute(query, params)
            rows = cursor.fetchall()

    start = pd.Timestamp(request.start_date).tz_localize(None)
    end = pd.Timestamp(request.end_date).tz_localize(None)

    if request.granularity == "day":
        start_period = start.normalize()
        end_period = end.normalize()

        if end != end_period:
            end_period += pd.Timedelta(days=1)

        frequency = "D"
    else:
        start_period = start.replace(
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        end_period = end.replace(
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        if end != end_period:
            end_period += pd.offsets.MonthBegin(1)

        frequency = "MS"

    periods = pd.date_range(
        start=start_period,
        end=end_period,
        freq=frequency,
        inclusive="left",
    )

    period_df = pd.DataFrame({
        "period": periods,
    })

    df = pd.DataFrame(
        rows,
        columns=["period", "amount", "count"],
    )

    if not df.empty:
        df["period"] = pd.to_datetime(df["period"])

    df = (
        period_df
        .merge(df, on="period", how="left")
        .fillna({
            "amount": 0,
            "count": 0,
        })
    )

    df["amount"] = df["amount"].astype("int64")
    df["count"] = df["count"].astype("int64")

    previous_amount = df["amount"].shift(1)

    df["change_rate"] = (
        (
            (df["amount"] - previous_amount)
            / previous_amount
            * 100
        )
        .where(previous_amount > 0)
        .round(1)
    )

    df["moving_average"] = (
        df["amount"]
        .rolling(
            window=3,
            min_periods=1,
        )
        .mean()
        .round(2)
    )

    points = [
        SpendingTrendPoint(
            period=row["period"],
            amount=int(row["amount"]),
            count=int(row["count"]),
            change_rate=(
                None
                if pd.isna(row["change_rate"])
                else float(row["change_rate"])
            ),
            moving_average=float(row["moving_average"]),
        )
        for row in df.to_dict(orient="records")
    ]

    return SpendingTrendResponse(
        granularity=request.granularity,
        points=points,
    )

def analyze_spending_anomalies(
    request: SpendingAnomalyRequest,
) -> SpendingAnomalyResponse:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            query = """
                SELECT
                    "id",
                    "title",
                    "category",
                    "amount",
                    "spentAt"
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
            """
            params = [
                request.user_id,
                request.start_date,
                request.end_date,
            ]

            if request.category is not None:
                query += ' AND "category" = %s'
                params.append(request.category)

            query += ' ORDER BY "spentAt"'

            cursor.execute(query, params)
            rows = cursor.fetchall()

    if not rows:
        return SpendingAnomalyResponse(
            threshold=request.threshold,
            anomalies=[],
        )

    df = pd.DataFrame(
        rows,
        columns=[
            "id",
            "title",
            "category",
            "amount",
            "spent_at",
        ],
    )

    category_group = df.groupby("category")["amount"]

    category_sum = category_group.transform("sum")
    category_count = category_group.transform("size")

    baseline_count = category_count - 1
    baseline_sum = category_sum - df["amount"]

    df["category_average"] = (
        baseline_sum / baseline_count
    )

    squared_sum = (
        df["amount"]
        .pow(2)
        .groupby(df["category"])
        .transform("sum")
    )

    baseline_squared_sum = (
        squared_sum - df["amount"].pow(2)
    )

    baseline_variance = (
        baseline_squared_sum / baseline_count
        - df["category_average"].pow(2)
    ).clip(lower=0)

    df["category_std"] = baseline_variance.pow(0.5)
    df["category_count"] = category_count

    df["z_score"] = (
        (
            df["amount"] - df["category_average"]
        )
        / df["category_std"]
    ).where(df["category_std"] > 0)

    enough_data = df["category_count"] >= 4

    z_score_anomaly = (
        (df["category_std"] > 0)
        & (df["z_score"] >= request.threshold)
    )

    zero_std_anomaly = (
        (df["category_std"] == 0)
        & (df["amount"] > df["category_average"])
    )

    anomaly_df = (
        df[
            enough_data
            & (z_score_anomaly | zero_std_anomaly)
        ]
        .sort_values(
            "amount",
            ascending=False,
        )
    )

    anomalies = [
        SpendingAnomaly(
            id=int(row["id"]),
            title=row["title"],
            category=row["category"],
            amount=int(row["amount"]),
            spent_at=row["spent_at"],
            category_average=round(
                float(row["category_average"]),
                2,
            ),
            z_score=(
                None
                if pd.isna(row["z_score"])
                else round(
                    float(row["z_score"]),
                    2,
                )
            ),
        )
        for row in anomaly_df.to_dict(orient="records")
    ]

    return SpendingAnomalyResponse(
        threshold=request.threshold,
        anomalies=anomalies,
    )

def analyze_spending_forecast(
    request: SpendingForecastRequest,
) -> SpendingForecastResponse:
    month_start = request.as_of_date.replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    days_in_month = monthrange(
        request.as_of_date.year,
        request.as_of_date.month,
    )[1]

    elapsed_days = (
        request.as_of_date - month_start
    ).total_seconds() / 86400

    remaining_days = max(
        days_in_month - elapsed_days,
        0,
    )

    with pool.connection() as connection:
        with connection.cursor() as cursor:
            query = """
                SELECT COALESCE(SUM("amount"), 0)
                FROM "Expense"
                WHERE "userId" = %s
                  AND "spentAt" >= %s
                  AND "spentAt" < %s
            """
            params = [
                request.user_id,
                month_start,
                request.as_of_date,
            ]

            if request.category is not None:
                query += ' AND "category" = %s'
                params.append(request.category)

            cursor.execute(query, params)
            row = cursor.fetchone()

    current_amount = int(row[0]) if row else 0

    if elapsed_days <= 0:
        daily_average = 0.0
        forecast_amount = current_amount
    else:
        daily_average = current_amount / elapsed_days
        forecast_amount = round(
            daily_average * days_in_month
        )

    return SpendingForecastResponse(
        current_amount=current_amount,
        forecast_amount=forecast_amount,
        daily_average=round(daily_average, 2),
        days_in_month=days_in_month,
        elapsed_days=round(elapsed_days, 2),
        remaining_days=round(remaining_days, 2),
        method="daily_average",
    )