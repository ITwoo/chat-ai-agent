import asyncio
from contextlib import suppress

from arq.worker import func

from api_python.queue.connection import (
    queue_redis_settings,
)
from api_python.queue.constants import (
    JOB_MAX_ATTEMPTS,
    USER_MEMORY_JOB_NAME_EXTRACT,
    USER_MEMORY_QUEUE,
)
from api_python.queue.producer import (
    queue_producer_service,
)
from api_python.queue.retention import (
    cleanup_queue_results,
)
from api_python.user_memory.maintenance import (
    recovery_loop,
    run_embedding_backfill,
)
from api_python.user_memory.worker import (
    extract_user_memories,
)


async def startup(
    context: dict,
) -> None:
    await queue_producer_service.connect()

    context[
        "queue_producer"
    ] = queue_producer_service

    await run_embedding_backfill()

    context[
        "recovery_task"
    ] = asyncio.create_task(
        recovery_loop()
    )


async def shutdown(
    context: dict,
) -> None:
    task = context.get(
        "recovery_task"
    )

    if task is not None:
        task.cancel()

        with suppress(
            asyncio.CancelledError
        ):
            await task

    await queue_producer_service.close()


async def cleanup_results(
    context: dict,
) -> None:
    await cleanup_queue_results(
        context,
        USER_MEMORY_QUEUE,
    )


class WorkerSettings:
    functions = [
        func(
            extract_user_memories,
            name=(
                USER_MEMORY_JOB_NAME_EXTRACT
            ),
            max_tries=(
                JOB_MAX_ATTEMPTS
            ),
            keep_result_forever=True,
        ),
    ]

    queue_name = (
        USER_MEMORY_QUEUE
    )

    redis_settings = (
        queue_redis_settings
    )

    max_tries = (
        JOB_MAX_ATTEMPTS
    )

    keep_result_forever = True

    on_startup = startup
    on_shutdown = shutdown

    after_job_end = (
        cleanup_results
    )