import logging
from typing import Any

from arq.constants import (
    result_key_prefix,
)
from arq.connections import ArqRedis

from api_python.queue.constants import (
    REMOVE_ON_COMPLETE_COUNT,
    REMOVE_ON_FAIL_COUNT,
)


logger = logging.getLogger(
    __name__
)


async def cleanup_queue_results(
    context: dict[str, Any],
    queue_name: str,
) -> None:
    redis: ArqRedis = context[
        "redis"
    ]

    try:
        results = (
            await redis.all_job_results()
        )

        queue_results = [
            result
            for result in results
            if result.queue_name
            == queue_name
        ]

        completed = sorted(
            (
                result
                for result
                in queue_results
                if result.success
            ),
            key=lambda result: (
                result.finish_time
            ),
            reverse=True,
        )

        failed = sorted(
            (
                result
                for result
                in queue_results
                if not result.success
            ),
            key=lambda result: (
                result.finish_time
            ),
            reverse=True,
        )

        stale_results = [
            *completed[
                REMOVE_ON_COMPLETE_COUNT:
            ],
            *failed[
                REMOVE_ON_FAIL_COUNT:
            ],
        ]

        if not stale_results:
            return

        keys = [
            result_key_prefix
            + result.job_id
            for result
            in stale_results
        ]

        await redis.delete(
            *keys
        )

    except Exception:
        logger.exception(
            "Queue 결과 정리 실패: "
            "queue=%s",
            queue_name,
        )