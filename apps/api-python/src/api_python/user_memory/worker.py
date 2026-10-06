import logging
from typing import Any

from api_python.database import (
    session_factory,
)
from api_python.queue.context import (
    job_request_context,
)
from api_python.queue.errors import (
    UnrecoverableJobError,
)
from api_python.queue.retry import (
    retry_or_raise,
)
from api_python.rag.embedding import (
    rag_embedding_service,
)
from api_python.user_memory.extraction import (
    UserMemoryExtractionService,
)
from api_python.user_memory.job_state import (
    UserMemoryJobStateService,
)
from api_python.user_memory.service import (
    UserMemoryService,
)


logger = logging.getLogger(
    "UserMemoryJobWorker"
)


EMPTY_RESULT = {
    "extractedCount": 0,
    "savedCount": 0,
    "archivedCount": 0,
    "skippedCount": 0,
}


async def extract_user_memories(
    context: dict[str, Any],
    *,
    user_id: int,
    message_id: int,
    request_id: str | None = None,
) -> dict[str, int]:
    with job_request_context(
        request_id
    ):
        async with (
            session_factory()
            as session
        ):
            memory_service = (
                UserMemoryService(
                    session,
                    rag_embedding_service,
                )
            )

            extraction_service = (
                UserMemoryExtractionService(
                    session,
                    memory_service,
                )
            )

            state_service = (
                UserMemoryJobStateService(
                    session,
                    context[
                        "queue_producer"
                    ],
                )
            )

            claim = (
                await state_service
                .claim_for_processing(
                    user_id,
                    message_id,
                )
            )

            if claim in {
                "ALREADY_COMPLETED",
                "ALREADY_PROCESSING",
            }:
                return EMPTY_RESULT

            if claim == "NOT_FOUND":
                raise (
                    UnrecoverableJobError(
                        "메모리 추출 대상 메시지를 "
                        "찾을 수 없습니다."
                    )
                )

            if claim == "INVALID_STATE":
                raise (
                    UnrecoverableJobError(
                        "메모리 추출 대상 메시지 "
                        "상태가 올바르지 않습니다."
                    )
                )

            try:
                content = (
                    await extraction_service
                    .get_source_message(
                        user_id,
                        message_id,
                    )
                )

                if content is None:
                    raise (
                        UnrecoverableJobError(
                            "메모리 추출 대상 사용자 "
                            "메시지를 찾을 수 없습니다."
                        )
                    )

                result = (
                    await extraction_service
                    .extract_and_save(
                        user_id,
                        message_id,
                        content,
                    )
                )

                await state_service.mark_completed(
                    user_id,
                    message_id,
                )

                return {
                    "extractedCount": (
                        result.extracted_count
                    ),
                    "savedCount": (
                        result.saved_count
                    ),
                    "archivedCount": (
                        result.archived_count
                    ),
                    "skippedCount": (
                        result.skipped_count
                    ),
                }

            except Exception as error:
                current_attempt = int(
                    context["job_try"]
                )

                max_attempts = 3

                will_retry = (
                    not isinstance(
                        error,
                        UnrecoverableJobError,
                    )
                    and current_attempt
                    < max_attempts
                )

                error_message = (
                    (
                        "메모리 추출 실패, "
                        "재시도 예정 "
                        f"({current_attempt}/"
                        f"{max_attempts}): "
                        f"{error}"
                    )
                    if will_retry
                    else str(error)
                )

                try:
                    await state_service.mark_failed(
                        user_id,
                        message_id,
                        error_message,
                        will_retry,
                    )
                except Exception:
                    logger.exception(
                        "사용자 메모리 실패 "
                        "상태 저장 오류"
                    )

                retry_or_raise(
                    context,
                    error,
                )