from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from api_python.database import (
    get_db,
)
from api_python.queue.producer import (
    queue_producer_service,
)
from api_python.rag.document_service import (
    RagDocumentService,
)
from api_python.rag.embedding import (
    rag_embedding_service,
)
from api_python.rag.search import (
    RagSearchService,
)
from api_python.rag.storage.provider import (
    get_rag_file_storage,
)


def get_rag_document_service(
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> RagDocumentService:
    return RagDocumentService(
        session=session,
        queue=queue_producer_service,
        storage=(
            get_rag_file_storage()
        ),
    )


def get_rag_search_service(
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> RagSearchService:
    return RagSearchService(
        session=session,
        embedding_service=(
            rag_embedding_service
        ),
    )


RagDocumentServiceDependency = (
    Annotated[
        RagDocumentService,
        Depends(
            get_rag_document_service
        ),
    ]
)


RagSearchServiceDependency = (
    Annotated[
        RagSearchService,
        Depends(
            get_rag_search_service
        ),
    ]
)