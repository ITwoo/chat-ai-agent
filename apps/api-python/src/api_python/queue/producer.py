import asyncio
from dataclasses import replace
from datetime import datetime, timezone

from arq import create_pool
from arq.constants import (
    in_progress_key_prefix,
    job_key_prefix,
    result_key_prefix,
)
from arq.connections import ArqRedis
from arq.jobs import (
    Job,
    JobStatus,
)

from api_python.observability.request_context import (
    get_request_id,
)
from api_python.queue.connection import (
    queue_redis_settings,
)
from api_python.queue.constants import (
    AGENT_JOB_NAME_HEALTH_CHECK,
    AGENT_JOB_QUEUE,
    RAG_DOCUMENT_JOB_NAME_INGEST,
    RAG_DOCUMENT_QUEUE,
    USER_MEMORY_JOB_NAME_EXTRACT,
    USER_MEMORY_QUEUE,
)
from api_python.queue.schemas import (
    DocumentIngestionJobData,
    DocumentIngestionJobSnapshot,
    HealthCheckJobData,
    RemoveDocumentIngestionJobResult,
    UserMemoryExtractionJobData,
    UserMemoryExtractionJobSnapshot,
)


_REMOVE_JOB_SCRIPT = """
if redis.call(
    'EXISTS',
    KEYS[4]
) == 1 then
    return 2
end

local queue_removed = redis.call(
    'ZREM',
    KEYS[1],
    ARGV[1]
)

local job_removed = redis.call(
    'DEL',
    KEYS[2]
)

local result_removed = redis.call(
    'DEL',
    KEYS[3]
)

if (
    queue_removed
    + job_removed
    + result_removed
) > 0 then
    return 1
end

return 0
"""


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


class QueueProducerService:
    def __init__(self) -> None:
        self._redis: (
            ArqRedis | None
        ) = None

        self._connect_lock = (
            asyncio.Lock()
        )

    async def connect(
        self,
    ) -> None:
        if self._redis is not None:
            return

        async with self._connect_lock:
            if self._redis is not None:
                return

            self._redis = (
                await create_pool(
                    queue_redis_settings
                )
            )

    async def close(
        self,
    ) -> None:
        redis = self._redis

        if redis is None:
            return

        self._redis = None

        await redis.aclose()

    async def _get_redis(
        self,
    ) -> ArqRedis:
        await self.connect()

        assert self._redis is not None

        return self._redis

    async def enqueue_health_check(
        self,
    ) -> Job:
        redis = (
            await self._get_redis()
        )

        data = HealthCheckJobData(
            requested_at=_utc_now_iso(),
            request_id=get_request_id(),
        )

        job = await redis.enqueue_job(
            AGENT_JOB_NAME_HEALTH_CHECK,
            requested_at=(
                data.requested_at
            ),
            request_id=(
                data.request_id
            ),
            _queue_name=(
                AGENT_JOB_QUEUE
            ),
        )

        if job is None:
            raise RuntimeError(
                "health-check Job 등록에 "
                "실패했습니다."
            )

        return job

    async def enqueue_document_ingestion(
        self,
        data: DocumentIngestionJobData,
    ) -> Job:
        redis = (
            await self._get_redis()
        )

        data = replace(
            data,
            request_id=get_request_id(),
        )

        job_id = (
            "rag-document-"
            f"{data.document_id}"
        )

        job = await redis.enqueue_job(
            RAG_DOCUMENT_JOB_NAME_INGEST,
            document_id=data.document_id,
            user_id=data.user_id,
            storage_key=data.storage_key,
            request_id=data.request_id,
            _job_id=job_id,
            _queue_name=(
                RAG_DOCUMENT_QUEUE
            ),
        )

        if job is not None:
            return job

        return Job(
            job_id,
            redis,
            _queue_name=(
                RAG_DOCUMENT_QUEUE
            ),
        )

    async def enqueue_user_memory_extraction(
        self,
        data: UserMemoryExtractionJobData,
    ) -> Job:
        redis = (
            await self._get_redis()
        )

        data = replace(
            data,
            request_id=get_request_id(),
        )

        job_id = (
            "user-memory-"
            f"{data.message_id}"
        )

        job = await redis.enqueue_job(
            USER_MEMORY_JOB_NAME_EXTRACT,
            user_id=data.user_id,
            message_id=data.message_id,
            request_id=data.request_id,
            _job_id=job_id,
            _queue_name=(
                USER_MEMORY_QUEUE
            ),
        )

        if job is not None:
            return job

        return Job(
            job_id,
            redis,
            _queue_name=(
                USER_MEMORY_QUEUE
            ),
        )

    async def remove_document_ingestion_job(
        self,
        document_id: int,
    ) -> RemoveDocumentIngestionJobResult:
        redis = (
            await self._get_redis()
        )

        job_id = (
            f"rag-document-{document_id}"
        )

        result = await redis.eval(
            _REMOVE_JOB_SCRIPT,
            4,
            RAG_DOCUMENT_QUEUE,
            job_key_prefix + job_id,
            result_key_prefix + job_id,
            in_progress_key_prefix
            + job_id,
            job_id,
        )

        if result == 2:
            return "ACTIVE"

        if result == 1:
            return "REMOVED"

        return "NOT_FOUND"

    async def get_document_ingestion_job_snapshot(
        self,
        document_id: int,
    ) -> DocumentIngestionJobSnapshot:
        redis = (
            await self._get_redis()
        )

        return await self._get_snapshot(
            redis,
            job_id=(
                "rag-document-"
                f"{document_id}"
            ),
            queue_name=(
                RAG_DOCUMENT_QUEUE
            ),
            snapshot_type=(
                DocumentIngestionJobSnapshot
            ),
        )

    async def get_user_memory_extraction_job_snapshot(
        self,
        message_id: int,
    ) -> UserMemoryExtractionJobSnapshot:
        redis = (
            await self._get_redis()
        )

        return await self._get_snapshot(
            redis,
            job_id=(
                "user-memory-"
                f"{message_id}"
            ),
            queue_name=(
                USER_MEMORY_QUEUE
            ),
            snapshot_type=(
                UserMemoryExtractionJobSnapshot
            ),
        )

    async def _get_snapshot(
        self,
        redis: ArqRedis,
        *,
        job_id: str,
        queue_name: str,
        snapshot_type,
    ):
        job = Job(
            job_id,
            redis,
            _queue_name=queue_name,
        )

        job_status = (
            await job.status()
        )

        if (
            job_status
            == JobStatus.not_found
        ):
            return snapshot_type(
                state="NOT_FOUND"
            )

        if (
            job_status
            == JobStatus.queued
        ):
            return snapshot_type(
                state="WAITING",
                failed_reason=None,
            )

        if (
            job_status
            == JobStatus.deferred
        ):
            return snapshot_type(
                state="DELAYED",
                failed_reason=None,
            )

        if (
            job_status
            == JobStatus.in_progress
        ):
            return snapshot_type(
                state="ACTIVE",
                failed_reason=None,
            )

        if (
            job_status
            == JobStatus.complete
        ):
            result = (
                await job.result_info()
            )

            if result is None:
                return snapshot_type(
                    state="UNKNOWN",
                    failed_reason=None,
                )

            if result.success:
                return snapshot_type(
                    state="COMPLETED",
                    failed_reason=None,
                )

            return snapshot_type(
                state="FAILED",
                failed_reason=(
                    str(result.result)
                    if result.result
                    is not None
                    else None
                ),
            )

        return snapshot_type(
            state="UNKNOWN",
            failed_reason=None,
        )


queue_producer_service = (
    QueueProducerService()
)