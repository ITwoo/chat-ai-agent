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
)
from app.db.postgres import pool
import pandas as pd

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