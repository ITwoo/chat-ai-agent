import logging
from datetime import (
    datetime,
    timezone,
)
from typing import Any

from api_python.queue.context import (
    job_request_context,
)


logger = logging.getLogger(
    "AgentJobProcessor"
)


def _utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(
            timespec="milliseconds"
        )
        .replace(
            "+00:00",
            "Z",
        )
    )


async def process_health_check(
    context: dict[str, Any],
    *,
    requested_at: str,
    request_id: str | None = None,
) -> dict[str, object]:
    with job_request_context(
        request_id
    ):
        requested_datetime = (
            datetime.fromisoformat(
                requested_at.replace(
                    "Z",
                    "+00:00",
                )
            )
        )

        processed_datetime = (
            datetime.now(
                timezone.utc
            )
        )

        elapsed_ms = int(
            (
                processed_datetime
                - requested_datetime
            ).total_seconds()
            * 1000
        )

        processed_at = (
            processed_datetime
            .isoformat(
                timespec="milliseconds"
            )
            .replace(
                "+00:00",
                "Z",
            )
        )

        logger.info(
            "health-check Job 처리 완료: "
            "jobId=%s",
            context["job_id"],
        )

        return {
            "requestedAt": (
                requested_at
            ),
            "processedAt": (
                processed_at
            ),
            "elapsedMs": (
                elapsed_ms
            ),
        }