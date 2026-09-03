from app.analysis.schemas import (
    CategoryComparison,
    CategorySummary,
    SpendingComparisonRequest,
    SpendingComparisonResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
)
from app.db.postgres import pool
import pandas as pd

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

    current_total = int(
        df.loc[df["period"] == "current", "amount"].sum()
    )

    previous_total = int(
        df.loc[df["period"] == "previous", "amount"].sum()
    )

    difference = current_total - previous_total

    change_rate = (
        round(difference / previous_total * 100, 1)
        if previous_total > 0
        else None
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
            change_rate=(
                round(
                    row["difference"] / row["previous"] * 100,
                    1,
                )
                if row["previous"] > 0
                else None
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