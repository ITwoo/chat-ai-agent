import asyncio
import logging

from api_python.database import (
    session_factory,
)
from api_python.queue.producer import (
    queue_producer_service,
)
from api_python.rag.embedding import (
    rag_embedding_service,
)
from api_python.redis.lock import (
    redis_lock_service,
)
from api_python.user_memory.job_state import (
    UserMemoryJobStateService,
)
from api_python.user_memory.service import (
    UserMemoryService,
)


BACKFILL_BATCH_SIZE = 25

BACKFILL_LOCK_TTL_MS = (
    30 * 60 * 1000
)

BACKFILL_LOCK_KEY = (
    "lock:chat-ai-agent:"
    "user-memory-embedding-backfill"
)

RECOVERY_INTERVAL_SECONDS = 60

RECOVERY_LOCK_TTL_MS = (
    5 * 60 * 1000
)

RECOVERY_LOCK_KEY = (
    "lock:chat-ai-agent:"
    "user-memory-recovery"
)


logger = logging.getLogger(
    "UserMemoryMaintenance"
)


async def run_embedding_backfill(
) -> None:
    lock = await redis_lock_service.acquire(
        BACKFILL_LOCK_KEY,
        BACKFILL_LOCK_TTL_MS,
    )

    if lock is None:
        return

    try:
        cursor = 0

        while True:
            async with session_factory() as session:
                service = (
                    UserMemoryService(
                        session,
                        rag_embedding_service,
                    )
                )

                batch = (
                    await service
                    .backfill_missing_embeddings(
                        cursor,
                        BACKFILL_BATCH_SIZE,
                    )
                )

            if (
                batch.next_cursor
                is None
                or batch.selected_count
                < BACKFILL_BATCH_SIZE
            ):
                break

            cursor = batch.next_cursor

    finally:
        await redis_lock_service.release(
            lock
        )


async def run_recovery_once(
) -> None:
    lock = await redis_lock_service.acquire(
        RECOVERY_LOCK_KEY,
        RECOVERY_LOCK_TTL_MS,
    )

    if lock is None:
        return

    try:
        async with session_factory() as session:
            service = (
                UserMemoryJobStateService(
                    session,
                    queue_producer_service,
                )
            )

            await service.recover_pending_and_stuck_extractions()

    finally:
        await redis_lock_service.release(
            lock
        )


async def recovery_loop(
) -> None:
    while True:
        try:
            await run_recovery_once()

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.exception(
                "사용자 메모리 복구 실패"
            )

        await asyncio.sleep(
            RECOVERY_INTERVAL_SECONDS
        )