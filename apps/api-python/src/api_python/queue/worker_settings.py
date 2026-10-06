from arq.worker import func

from api_python.queue.agent_worker import (
    process_health_check,
)
from api_python.queue.connection import (
    queue_redis_settings,
)
from api_python.queue.constants import (
    AGENT_JOB_NAME_HEALTH_CHECK,
    AGENT_JOB_QUEUE,
    JOB_MAX_ATTEMPTS,
)
from api_python.queue.retention import (
    cleanup_queue_results,
)


async def cleanup_agent_results(
    context: dict,
) -> None:
    await cleanup_queue_results(
        context,
        AGENT_JOB_QUEUE,
    )


class WorkerSettings:
    functions = [
        func(
            process_health_check,
            name=(
                AGENT_JOB_NAME_HEALTH_CHECK
            ),
            max_tries=(
                JOB_MAX_ATTEMPTS
            ),
            keep_result_forever=True,
        ),
    ]

    queue_name = AGENT_JOB_QUEUE

    redis_settings = (
        queue_redis_settings
    )

    max_tries = JOB_MAX_ATTEMPTS

    keep_result_forever = True

    after_job_end = (
        cleanup_agent_results
    )