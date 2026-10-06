from arq.worker import func

from api_python.queue.connection import (
    queue_redis_settings,
)
from api_python.queue.constants import (
    JOB_MAX_ATTEMPTS,
    RAG_DOCUMENT_JOB_NAME_INGEST,
    RAG_DOCUMENT_QUEUE,
)
from api_python.queue.retention import (
    cleanup_queue_results,
)
from api_python.rag.worker import (
    ingest_document,
)


async def cleanup_rag_results(
    context: dict,
) -> None:
    await cleanup_queue_results(
        context,
        RAG_DOCUMENT_QUEUE,
    )


class WorkerSettings:
    functions = [
        func(
            ingest_document,
            name=(
                RAG_DOCUMENT_JOB_NAME_INGEST
            ),
            max_tries=(
                JOB_MAX_ATTEMPTS
            ),
            keep_result_forever=True,
        ),
    ]

    queue_name = (
        RAG_DOCUMENT_QUEUE
    )

    redis_settings = (
        queue_redis_settings
    )

    max_tries = (
        JOB_MAX_ATTEMPTS
    )

    keep_result_forever = True

    after_job_end = (
        cleanup_rag_results
    )