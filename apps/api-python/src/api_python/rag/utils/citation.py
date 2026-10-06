from api_python.rag.schemas import (
    RagCitation,
)
from api_python.rag.types import (
    RagSearchResult,
)


def create_rag_citations(
    results: list[RagSearchResult],
) -> list[RagCitation]:
    return [
        RagCitation(
            document_id=result.document_id,
            chunk_id=result.chunk_id,
            chunk_index=result.chunk_index,
            page_number=result.page_number,
            file_name=result.file_name,
            similarity=result.similarity,
        )
        for result in results
    ]