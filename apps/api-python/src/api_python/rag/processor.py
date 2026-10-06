import logging

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
)
from sqlalchemy import (
    delete,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
)

from api_python.models.enums import (
    RagDocumentStatus,
)
from api_python.models.rag import (
    RagDocument,
    RagDocumentChunk,
)
from api_python.queue.errors import (
    UnrecoverableJobError,
)
from api_python.rag.constants import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
)
from api_python.rag.embedding import (
    rag_embedding_service,
)
from api_python.rag.extractors.service import (
    RagDocumentExtractorService,
)
from api_python.rag.storage.provider import (
    get_rag_file_storage,
)


logger = logging.getLogger(
    "RagDocumentProcessor"
)


splitter = (
    RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
)


async def process_rag_document(
    session_factory: async_sessionmaker[
        AsyncSession
    ],
    *,
    document_id: int,
    user_id: int,
    storage_key: str,
) -> dict[str, int]:
    storage = (
        get_rag_file_storage()
    )

    extractor = (
        RagDocumentExtractorService(
            storage
        )
    )

    async with session_factory() as session:
        claimed = (
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
                    RagDocument.status.in_(
                        [
                            RagDocumentStatus.PENDING,
                            RagDocumentStatus.PROCESSING,
                        ]
                    ),
                )
                .values(
                    status=(
                        RagDocumentStatus.PROCESSING
                    ),
                    error=None,
                )
            )
        )

        await session.commit()

        if claimed.rowcount != 1:
            result = (
                await session.execute(
                    select(
                        RagDocument.status,
                        func.count(
                            RagDocumentChunk.id
                        ),
                    )
                    .outerjoin(
                        RagDocumentChunk,
                        RagDocumentChunk.document_id
                        == RagDocument.id,
                    )
                    .where(
                        RagDocument.id
                        == document_id,
                        RagDocument.user_id
                        == user_id,
                        RagDocument.storage_key
                        == storage_key,
                    )
                    .group_by(
                        RagDocument.id
                    )
                )
            )

            row = result.one_or_none()

            if row is None:
                raise UnrecoverableJobError(
                    "RAG 문서를 찾을 수 없습니다: "
                    f"documentId={document_id}"
                )

            status_value, chunk_count = row

            if (
                status_value
                == RagDocumentStatus.READY
                and chunk_count > 0
            ):
                return {
                    "documentId": document_id,
                    "chunkCount": int(
                        chunk_count
                    ),
                }

            raise UnrecoverableJobError(
                "현재 상태에서 RAG 문서를 처리할 수 없습니다: "
                f"documentId={document_id}, "
                f"status={status_value}"
            )

    extraction = (
        await extractor.extract(
            storage_key
        )
    )

    chunks: list[
        tuple[str, int | None]
    ] = []

    for section in extraction.sections:
        section_chunks = (
            await splitter.asplit_text(
                section.content
            )
        )

        for content in section_chunks:
            chunks.append(
                (
                    content,
                    section.page_number,
                )
            )

    if not chunks:
        raise UnrecoverableJobError(
            "문서에서 저장할 텍스트를 찾을 수 없습니다."
        )

    embedded_chunks: list[
        RagDocumentChunk
    ] = []

    for index, (
        content,
        page_number,
    ) in enumerate(chunks):
        result = (
            await rag_embedding_service
            .embed_text(content)
        )

        embedded_chunks.append(
            RagDocumentChunk(
                document_id=document_id,
                chunk_index=index,
                page_number=page_number,
                content=content,
                token_count=(
                    result.token_count
                ),
                embedding=(
                    result.embedding
                ),
            )
        )

    async with session_factory() as session:
        async with session.begin():
            result = (
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
                        error=None,
                    )
                )
            )

            if result.rowcount != 1:
                raise UnrecoverableJobError(
                    "RAG 문서 상태가 변경되어 처리 결과를 저장할 수 없습니다: "
                    f"documentId={document_id}"
                )

            await session.execute(
                delete(
                    RagDocumentChunk
                ).where(
                    RagDocumentChunk.document_id
                    == document_id
                )
            )

            session.add_all(
                embedded_chunks
            )

            await session.execute(
                update(
                    RagDocument
                )
                .where(
                    RagDocument.id
                    == document_id
                )
                .values(
                    status=(
                        RagDocumentStatus.READY
                    ),
                    error=None,
                )
            )

    logger.info(
        "RAG 문서 처리 완료: documentId=%s, chunks=%s",
        document_id,
        len(chunks),
    )

    return {
        "documentId": document_id,
        "chunkCount": len(chunks),
    }