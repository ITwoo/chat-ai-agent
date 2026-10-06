from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Query,
    UploadFile,
)

from api_python.auth.dependencies import (
    CurrentUser,
)
from api_python.rag.dependencies import (
    RagDocumentServiceDependency,
    RagSearchServiceDependency,
)
from api_python.rag.schemas import (
    GetRagDocumentsQuery,
    RagDocumentDeleteResponse,
    RagDocumentReprocessResponse,
    RagDocumentsPageResponse,
    RagDocumentResponse,
    RagDocumentUploadResponse,
    RagSearchRequest,
    RagSearchResultResponse,
)


documents_router = APIRouter(
    prefix="/rag/documents",
    tags=["rag"],
)


search_router = APIRouter(
    prefix="/rag/search",
    tags=["rag"],
)


@documents_router.get(
    "",
    response_model=(
        RagDocumentsPageResponse
    ),
    response_model_by_alias=True,
)
async def get_documents(
    user: CurrentUser,
    service: (
        RagDocumentServiceDependency
    ),
    query: Annotated[
        GetRagDocumentsQuery,
        Query(),
    ],
) -> RagDocumentsPageResponse:
    documents, next_cursor = (
        await service.get_documents(
            user.id,
            query,
        )
    )

    return RagDocumentsPageResponse(
        documents=[
            RagDocumentResponse(
                **document
            )
            for document
            in documents
        ],
        next_cursor=next_cursor,
    )


@documents_router.post(
    "",
    response_model=(
        RagDocumentUploadResponse
    ),
    response_model_by_alias=True,
)
async def upload_document(
    user: CurrentUser,
    service: (
        RagDocumentServiceDependency
    ),
    file: Annotated[
        UploadFile,
        File(),
    ],
) -> RagDocumentUploadResponse:
    result = (
        await service
        .create_pending_document(
            user.id,
            file,
        )
    )

    return (
        RagDocumentUploadResponse(
            **result
        )
    )


@documents_router.post(
    "/{document_id}/reprocess",
    response_model=(
        RagDocumentReprocessResponse
    ),
    response_model_by_alias=True,
)
async def reprocess_document(
    document_id: int,
    user: CurrentUser,
    service: (
        RagDocumentServiceDependency
    ),
) -> RagDocumentReprocessResponse:
    result = (
        await service
        .reprocess_document(
            user.id,
            document_id,
        )
    )

    return (
        RagDocumentReprocessResponse(
            **result
        )
    )


@documents_router.delete(
    "/{document_id}",
    response_model=(
        RagDocumentDeleteResponse
    ),
    response_model_by_alias=True,
)
async def delete_document(
    document_id: int,
    user: CurrentUser,
    service: (
        RagDocumentServiceDependency
    ),
) -> RagDocumentDeleteResponse:
    result = (
        await service
        .delete_document(
            user.id,
            document_id,
        )
    )

    return (
        RagDocumentDeleteResponse(
            **result
        )
    )


@search_router.post(
    "",
    response_model=list[
        RagSearchResultResponse
    ],
    response_model_by_alias=True,
)
async def search_documents(
    body: RagSearchRequest,
    user: CurrentUser,
    service: (
        RagSearchServiceDependency
    ),
) -> list[
    RagSearchResultResponse
]:
    results = await service.search(
        user.id,
        body.query,
        body.limit or 5,
        body.lexical_queries,
    )

    return [
        RagSearchResultResponse(
            chunk_id=result.chunk_id,
            document_id=(
                result.document_id
            ),
            chunk_index=(
                result.chunk_index
            ),
            page_number=(
                result.page_number
            ),
            content=result.content,
            token_count=(
                result.token_count
            ),
            file_name=(
                result.file_name
            ),
            distance=result.distance,
            similarity=(
                result.similarity
            ),
            vector_rank=(
                result.vector_rank
            ),
            keyword_rank=(
                result.keyword_rank
            ),
            rrf_score=(
                result.rrf_score
            ),
        )
        for result in results
    ]