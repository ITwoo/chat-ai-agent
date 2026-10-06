import logging
from typing import Any

from api_python.database import (
    session_factory,
)
from api_python.models.enums import (
    RagDocumentStatus,
)
from api_python.models.rag import (
    RagDocument,
)
from api_python.queue.context import (
    job_request_context,
)
from api_python.queue.retry import (
    retry_or_raise,
)
from api_python.rag.processor import (
    process_rag_document,
)
from sqlalchemy import update


logger = logging.getLogger(
    "RagDocumentWorker"
)


async def ingest_document(
    context: dict[str, Any],
    *,
    document_id: int,
    user_id: int,
    storage_key: str,
    request_id: str | None = None,
) -> dict[str, int]:
    with job_request_context(
        request_id
    ):
        try:
            return await process_rag_document(
                session_factory,
                document_id=document_id,
                user_id=user_id,
                storage_key=storage_key,
            )

        except Exception as error:
            current_attempt = int(
                context["job_try"]
            )

            max_attempts = 3

            from api_python.queue.errors import (
                UnrecoverableJobError,
            )

            unrecoverable = isinstance(
                error,
                UnrecoverableJobError,
            )

            will_retry = (
                not unrecoverable
                and current_attempt
                < max_attempts
            )

            async with session_factory() as session:
                await session.execute(
                    update(
                        RagDocument
                    )
                    .where(
                        RagDocument.id
                        == document_id,
                        RagDocument.user_id
                        == user_id,
                        RagDocument.storage_key
                        == storage_key,
                        RagDocument.status
                        == RagDocumentStatus.PROCESSING,
                    )
                    .values(
                        status=(
                            RagDocumentStatus.PENDING
                            if will_retry
                            else RagDocumentStatus.FAILED
                        ),
                        error=(
                            (
                                "문서 처리 실패, 재시도 예정 "
                                f"({current_attempt}/{max_attempts}): "
                                f"{error}"
                            )
                            if will_retry
                            else str(error)
                        ),
                    )
                )

                await session.commit()

            logger.exception(
                "RAG 문서 처리 실패: "
                "documentId=%s, attempt=%s/%s, willRetry=%s",
                document_id,
                current_attempt,
                max_attempts,
                will_retry,
            )

            retry_or_raise(
                context,
                error,
            )