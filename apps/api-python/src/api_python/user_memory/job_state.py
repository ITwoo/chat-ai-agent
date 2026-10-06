from dataclasses import dataclass
from datetime import (
    datetime,
    timedelta,
    timezone,
)
from typing import Literal

from sqlalchemy import (
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from api_python.models.chat import (
    ChatMessage,
    ChatRoom,
)
from api_python.models.enums import (
    ChatMessageRole,
    UserMemoryExtractionStatus,
)
from api_python.queue.producer import (
    QueueProducerService,
)
from api_python.queue.schemas import (
    UserMemoryExtractionJobData,
)
from api_python.user_memory.types import (
    RecoverUserMemoryExtractionsResult,
)


PrepareResult = Literal[
    "ENQUEUE",
    "SKIP_PROCESSING",
    "SKIP_COMPLETED",
]

ClaimResult = Literal[
    "PROCESS",
    "ALREADY_PROCESSING",
    "ALREADY_COMPLETED",
    "NOT_FOUND",
    "INVALID_STATE",
]

RecoveryAction = Literal[
    "REQUEUED",
    "RESET_TO_PENDING",
    "FAILED",
    "ACTIVE",
    "SKIPPED",
]


PROCESSING_STALE_AFTER = timedelta(
    minutes=5
)

RECOVERY_BATCH_SIZE = 100


@dataclass(
    slots=True,
    frozen=True,
)
class RecoveryTarget:
    message_id: int
    user_id: int
    status: UserMemoryExtractionStatus
    started_at: datetime | None


class UserMemoryJobStateService:
    def __init__(
        self,
        session: AsyncSession,
        queue: QueueProducerService,
    ) -> None:
        self._session = session
        self._queue = queue

    async def _get_status(
        self,
        user_id: int,
        message_id: int,
    ) -> (
        UserMemoryExtractionStatus
        | None
        | Literal["NOT_FOUND"]
    ):
        result = await self._session.execute(
            select(
                ChatMessage
                .memory_extraction_status
            )
            .join(
                ChatRoom,
                ChatRoom.id
                == ChatMessage.room_id,
            )
            .where(
                ChatMessage.id
                == message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatRoom.user_id
                == user_id,
            )
        )

        row = result.one_or_none()

        if row is None:
            return "NOT_FOUND"

        return row[0]

    async def prepare_for_enqueue(
        self,
        user_id: int,
        message_id: int,
    ) -> PrepareResult:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == user_id
                    )
                ),
                or_(
                    ChatMessage
                    .memory_extraction_status
                    .is_(None),
                    ChatMessage
                    .memory_extraction_status
                    .in_(
                        [
                            UserMemoryExtractionStatus.PENDING,
                            UserMemoryExtractionStatus.FAILED,
                        ]
                    ),
                ),
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.PENDING
                ),
                memory_extraction_error=None,
                memory_extraction_started_at=None,
                memory_extracted_at=None,
            )
        )

        await self._session.commit()

        if result.rowcount == 1:
            return "ENQUEUE"

        current = await self._get_status(
            user_id,
            message_id,
        )

        if current == "NOT_FOUND":
            raise RuntimeError(
                "메모리 추출 대상 메시지를 "
                f"찾을 수 없습니다: "
                f"userId={user_id}, "
                f"messageId={message_id}"
            )

        if (
            current
            == UserMemoryExtractionStatus.PROCESSING
        ):
            return "SKIP_PROCESSING"

        if (
            current
            == UserMemoryExtractionStatus.COMPLETED
        ):
            return "SKIP_COMPLETED"

        raise RuntimeError(
            "메모리 추출 Job 등록 준비 실패: "
            f"userId={user_id}, "
            f"messageId={message_id}, "
            f"status={current}"
        )

    async def claim_for_processing(
        self,
        user_id: int,
        message_id: int,
    ) -> ClaimResult:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == user_id
                    )
                ),
                ChatMessage
                .memory_extraction_status
                == UserMemoryExtractionStatus.PENDING,
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.PROCESSING
                ),
                memory_extraction_error=None,
                memory_extraction_started_at=(
                    datetime.now(
                        timezone.utc
                    )
                ),
            )
        )

        await self._session.commit()

        if result.rowcount == 1:
            return "PROCESS"

        current = await self._get_status(
            user_id,
            message_id,
        )

        if current == "NOT_FOUND":
            return "NOT_FOUND"

        if (
            current
            == UserMemoryExtractionStatus.PROCESSING
        ):
            return "ALREADY_PROCESSING"

        if (
            current
            == UserMemoryExtractionStatus.COMPLETED
        ):
            return "ALREADY_COMPLETED"

        return "INVALID_STATE"

    async def mark_completed(
        self,
        user_id: int,
        message_id: int,
    ) -> None:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == user_id
                    )
                ),
                ChatMessage
                .memory_extraction_status
                == UserMemoryExtractionStatus.PROCESSING,
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.COMPLETED
                ),
                memory_extraction_error=None,
                memory_extraction_started_at=None,
                memory_extracted_at=(
                    datetime.now(
                        timezone.utc
                    )
                ),
            )
        )

        await self._session.commit()

        if result.rowcount != 1:
            raise RuntimeError(
                "메모리 추출 완료 상태 저장 실패: "
                f"userId={user_id}, "
                f"messageId={message_id}"
            )

    async def mark_failed(
        self,
        user_id: int,
        message_id: int,
        error_message: str,
        will_retry: bool,
    ) -> bool:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == user_id
                    )
                ),
                ChatMessage
                .memory_extraction_status
                == UserMemoryExtractionStatus.PROCESSING,
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.PENDING
                    if will_retry
                    else UserMemoryExtractionStatus.FAILED
                ),
                memory_extraction_error=(
                    error_message
                ),
                memory_extraction_started_at=None,
                memory_extracted_at=None,
            )
        )

        await self._session.commit()

        return result.rowcount == 1

    async def recover_pending_and_stuck_extractions(
        self,
    ) -> RecoverUserMemoryExtractionsResult:
        stale_before = (
            datetime.now(
                timezone.utc
            )
            - PROCESSING_STALE_AFTER
        )

        result = await self._session.execute(
            select(
                ChatMessage.id,
                ChatMessage
                .memory_extraction_status,
                ChatMessage
                .memory_extraction_started_at,
                ChatRoom.user_id,
            )
            .join(
                ChatRoom,
                ChatRoom.id
                == ChatMessage.room_id,
            )
            .where(
                ChatMessage.role
                == ChatMessageRole.USER,
                or_(
                    ChatMessage
                    .memory_extraction_status
                    == UserMemoryExtractionStatus.PENDING,
                    (
                        ChatMessage
                        .memory_extraction_status
                        == UserMemoryExtractionStatus.PROCESSING
                    )
                    & (
                        ChatMessage
                        .memory_extraction_started_at
                        < stale_before
                    ),
                ),
            )
            .order_by(
                ChatMessage.id.asc()
            )
            .limit(
                RECOVERY_BATCH_SIZE
            )
        )

        targets = [
            RecoveryTarget(
                message_id=row.id,
                user_id=row.user_id,
                status=(
                    row.memory_extraction_status
                ),
                started_at=(
                    row.memory_extraction_started_at
                ),
            )
            for row in result
        ]

        recovered = (
            RecoverUserMemoryExtractionsResult(
                checked_count=len(
                    targets
                ),
                requeued_count=0,
                reset_to_pending_count=0,
                marked_failed_count=0,
                active_count=0,
            )
        )

        for target in targets:
            try:
                action = (
                    await self._recover_target(
                        target
                    )
                )
            except Exception:
                continue

            if action == "REQUEUED":
                recovered.requeued_count += 1
            elif action == "RESET_TO_PENDING":
                recovered.reset_to_pending_count += 1
            elif action == "FAILED":
                recovered.marked_failed_count += 1
            elif action == "ACTIVE":
                recovered.active_count += 1

        return recovered

    async def _recover_target(
        self,
        target: RecoveryTarget,
    ) -> RecoveryAction:
        snapshot = (
            await self._queue
            .get_user_memory_extraction_job_snapshot(
                target.message_id
            )
        )

        if snapshot.state == "ACTIVE":
            return "ACTIVE"

        if (
            target.status
            == UserMemoryExtractionStatus.PENDING
        ):
            if snapshot.state in {
                "WAITING",
                "DELAYED",
            }:
                return "SKIPPED"

            if snapshot.state == "NOT_FOUND":
                await self._queue.enqueue_user_memory_extraction(
                    UserMemoryExtractionJobData(
                        user_id=(
                            target.user_id
                        ),
                        message_id=(
                            target.message_id
                        ),
                    )
                )

                return "REQUEUED"

            return await self._mark_recovery_failed(
                target,
                (
                    snapshot.failed_reason
                    or "메모리 추출 Job 상태가 "
                    f"일치하지 않습니다: "
                    f"{snapshot.state}"
                ),
            )

        if snapshot.state in {
            "WAITING",
            "DELAYED",
        }:
            return (
                await self._reset_processing_to_pending(
                    target
                )
            )

        if snapshot.state == "NOT_FOUND":
            reset_result = (
                await self._reset_processing_to_pending(
                    target
                )
            )

            if (
                reset_result
                != "RESET_TO_PENDING"
            ):
                return reset_result

            await self._queue.enqueue_user_memory_extraction(
                UserMemoryExtractionJobData(
                    user_id=(
                        target.user_id
                    ),
                    message_id=(
                        target.message_id
                    ),
                )
            )

            return "REQUEUED"

        return await self._mark_recovery_failed(
            target,
            (
                snapshot.failed_reason
                or "메모리 추출 Job 상태가 "
                f"일치하지 않습니다: "
                f"{snapshot.state}"
            ),
        )

    async def _reset_processing_to_pending(
        self,
        target: RecoveryTarget,
    ) -> RecoveryAction:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == target.message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == target.user_id
                    )
                ),
                ChatMessage
                .memory_extraction_status
                == UserMemoryExtractionStatus.PROCESSING,
                ChatMessage
                .memory_extraction_started_at
                == target.started_at,
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.PENDING
                ),
                memory_extraction_error=None,
                memory_extraction_started_at=None,
            )
        )

        await self._session.commit()

        return (
            "RESET_TO_PENDING"
            if result.rowcount == 1
            else "SKIPPED"
        )

    async def _mark_recovery_failed(
        self,
        target: RecoveryTarget,
        error_message: str,
    ) -> RecoveryAction:
        result = await self._session.execute(
            update(
                ChatMessage
            )
            .where(
                ChatMessage.id
                == target.message_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.room_id.in_(
                    select(
                        ChatRoom.id
                    ).where(
                        ChatRoom.user_id
                        == target.user_id
                    )
                ),
                ChatMessage
                .memory_extraction_status
                == target.status,
            )
            .values(
                memory_extraction_status=(
                    UserMemoryExtractionStatus.FAILED
                ),
                memory_extraction_error=(
                    error_message
                ),
                memory_extraction_started_at=None,
                memory_extracted_at=None,
            )
        )

        await self._session.commit()

        return (
            "FAILED"
            if result.rowcount == 1
            else "SKIPPED"
        )