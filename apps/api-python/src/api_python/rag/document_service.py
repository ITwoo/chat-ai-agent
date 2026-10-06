import logging
from pathlib import Path
from uuid import uuid4

from fastapi import (
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import (
    delete,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from api_python.models.enums import (
    RagDocumentStatus,
)
from api_python.models.rag import (
    RagDocument,
    RagDocumentChunk,
)
from api_python.queue.producer import (
    QueueProducerService,
)
from api_python.queue.schemas import (
    DocumentIngestionJobData,
)
from api_python.rag.constants import (
    DEFAULT_DOCUMENT_LIST_LIMIT,
    MAX_UPLOAD_SIZE,
)
from api_python.rag.schemas import (
    GetRagDocumentsQuery,
)
from api_python.rag.storage.base import (
    RagFileStorageService,
)


logger = logging.getLogger(
    "RagDocumentService"
)


class RagDocumentService:
    def __init__(
        self,
        session: AsyncSession,
        queue: QueueProducerService,
        storage: RagFileStorageService,
    ) -> None:
        self._session = session
        self._queue = queue
        self._storage = storage

    async def get_documents(
        self,
        user_id: int,
        query: GetRagDocumentsQuery,
    ) -> tuple[
        list[dict],
        int | None,
    ]:
        limit = (
            query.limit
            or DEFAULT_DOCUMENT_LIST_LIMIT
        )

        chunk_count = (
            select(
                func.count(
                    RagDocumentChunk.id
                )
            )
            .where(
                RagDocumentChunk.document_id
                == RagDocument.id
            )
            .correlate(
                RagDocument
            )
            .scalar_subquery()
        )

        statement = (
            select(
                RagDocument,
                chunk_count.label(
                    "chunk_count"
                ),
            )
            .where(
                RagDocument.user_id
                == user_id
            )
            .order_by(
                RagDocument.id.desc()
            )
            .limit(
                limit + 1
            )
        )

        if query.cursor is not None:
            statement = statement.where(
                RagDocument.id
                < query.cursor
            )

        result = (
            await self._session.execute(
                statement
            )
        )

        rows = result.all()

        has_next = (
            len(rows) > limit
        )

        page_rows = (
            rows[:limit]
            if has_next
            else rows
        )

        documents = [
            {
                "id": document.id,
                "file_name": (
                    document.file_name
                ),
                "mime_type": (
                    document.mime_type
                ),
                "size_bytes": (
                    document.size_bytes
                ),
                "status": (
                    document.status
                ),
                "error": (
                    document.error
                ),
                "chunk_count": (
                    chunk_count_value
                ),
                "created_at": (
                    document.created_at
                ),
                "updated_at": (
                    document.updated_at
                ),
            }
            for (
                document,
                chunk_count_value,
            ) in page_rows
        ]

        next_cursor = (
            page_rows[-1][0].id
            if (
                has_next
                and page_rows
            )
            else None
        )

        return (
            documents,
            next_cursor,
        )

    async def create_pending_document(
        self,
        user_id: int,
        file: UploadFile,
    ) -> dict:
        original_name = (
            Path(
                file.filename
                or ""
            )
            .name
        )

        extension = (
            Path(original_name)
            .suffix
            .lower()
        )

        mime_type = (
            file.content_type
            or ""
        )

        valid = (
            (
                mime_type
                == "text/plain"
                and extension
                == ".txt"
            )
            or (
                mime_type
                == "application/pdf"
                and extension
                == ".pdf"
            )
        )

        if not valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "현재는 .txt 또는 .pdf 파일만 업로드할 수 있습니다."
                ),
            )

        data = await file.read(
            MAX_UPLOAD_SIZE + 1
        )

        if (
            len(data)
            > MAX_UPLOAD_SIZE
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="파일 크기는 5MB 이하여야 합니다.",
            )

        storage_key = (
            f"{uuid4()}{extension}"
        )

        await self._storage.write(
            storage_key,
            data,
        )

        document: (
            RagDocument | None
        ) = None

        try:
            document = RagDocument(
                user_id=user_id,
                file_name=original_name,
                storage_key=storage_key,
                mime_type=mime_type,
                size_bytes=len(data),
            )

            self._session.add(
                document
            )

            await self._session.commit()
            await self._session.refresh(
                document
            )

            job = (
                await self._queue
                .enqueue_document_ingestion(
                    DocumentIngestionJobData(
                        document_id=document.id,
                        user_id=user_id,
                        storage_key=storage_key,
                    )
                )
            )

            return {
                "id": document.id,
                "file_name": (
                    document.file_name
                ),
                "mime_type": (
                    document.mime_type
                ),
                "size_bytes": (
                    document.size_bytes
                ),
                "status": (
                    document.status
                ),
                "job_id": (
                    job.job_id
                ),
                "created_at": (
                    document.created_at
                ),
            }

        except Exception as error:
            await self._session.rollback()

            if document is not None:
                try:
                    await self._session.execute(
                        update(
                            RagDocument
                        )
                        .where(
                            RagDocument.id
                            == document.id
                        )
                        .values(
                            status=(
                                RagDocumentStatus.FAILED
                            ),
                            error=(
                                "문서 처리 Job 등록 실패: "
                                f"{error}"
                            ),
                        )
                    )

                    await self._session.commit()

                except Exception:
                    logger.exception(
                        "RAG 문서 실패 상태 저장 오류"
                    )

            else:
                try:
                    await self._storage.delete(
                        storage_key
                    )
                except Exception:
                    logger.exception(
                        "RAG 업로드 파일 정리 실패"
                    )

            raise

    async def reprocess_document(
        self,
        user_id: int,
        document_id: int,
    ) -> dict:
        document = (
            await self._get_owned_document(
                user_id,
                document_id,
            )
        )

        if not await self._storage.exists(
            document.storage_key
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "원본 파일이 없어 문서를 재처리할 수 없습니다."
                ),
            )

        remove_result = (
            await self._queue
            .remove_document_ingestion_job(
                document.id
            )
        )

        if remove_result == "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "현재 처리 중인 RAG 문서는 다시 처리할 수 없습니다."
                ),
            )

        await self._session.execute(
            update(
                RagDocument
            )
            .where(
                RagDocument.id
                == document.id,
                RagDocument.user_id
                == user_id,
            )
            .values(
                status=(
                    RagDocumentStatus.PENDING
                ),
                error=None,
            )
        )

        await self._session.commit()

        try:
            await self._queue.enqueue_document_ingestion(
                DocumentIngestionJobData(
                    document_id=document.id,
                    user_id=user_id,
                    storage_key=(
                        document.storage_key
                    ),
                )
            )

        except Exception as error:
            await self._session.execute(
                update(
                    RagDocument
                )
                .where(
                    RagDocument.id
                    == document.id,
                    RagDocument.user_id
                    == user_id,
                    RagDocument.status
                    == RagDocumentStatus.PENDING,
                )
                .values(
                    status=(
                        RagDocumentStatus.FAILED
                    ),
                    error=(
                        "문서 재처리 Job 등록 실패: "
                        f"{error}"
                    ),
                )
            )

            await self._session.commit()
            raise

        return {
            "document_id": (
                document.id
            ),
            "status": "PENDING",
        }

    async def delete_document(
        self,
        user_id: int,
        document_id: int,
    ) -> dict:
        document = (
            await self._get_owned_document(
                user_id,
                document_id,
            )
        )

        result = (
            await self._queue
            .remove_document_ingestion_job(
                document.id
            )
        )

        if result == "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "현재 처리 중인 RAG 문서는 삭제할 수 없습니다."
                ),
            )

        await self._session.execute(
            delete(
                RagDocument
            ).where(
                RagDocument.id
                == document.id,
                RagDocument.user_id
                == user_id,
            )
        )

        await self._session.commit()

        try:
            await self._storage.delete(
                document.storage_key
            )
        except Exception:
            logger.exception(
                "RAG 원본 파일 삭제 실패: storageKey=%s",
                document.storage_key,
            )

        return {
            "document_id": (
                document.id
            ),
            "deleted": True,
        }

    async def _get_owned_document(
        self,
        user_id: int,
        document_id: int,
    ) -> RagDocument:
        result = (
            await self._session.execute(
                select(
                    RagDocument
                ).where(
                    RagDocument.id
                    == document_id,
                    RagDocument.user_id
                    == user_id,
                )
            )
        )

        document = (
            result.scalar_one_or_none()
        )

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "RAG 문서를 찾을 수 없습니다."
                ),
            )

        return document