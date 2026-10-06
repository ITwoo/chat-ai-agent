from api_python.queue.errors import (
    UnrecoverableJobError,
)
from api_python.rag.extractors.base import (
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagExtractedSection,
)


class RagTextFileExtractor:
    def supports(
        self,
        extension: str,
    ) -> bool:
        return extension == ".txt"

    async def extract(
        self,
        input_data: (
            RagDocumentExtractionInput
        ),
    ) -> RagDocumentExtractionResult:
        content = input_data.data.decode(
            "utf-8"
        )

        normalized = (
            content.removeprefix("\ufeff")
            .strip()
        )

        if not normalized:
            raise UnrecoverableJobError(
                "RAG 문서가 비어 있습니다."
            )

        return RagDocumentExtractionResult(
            sections=[
                RagExtractedSection(
                    content=normalized,
                    page_number=None,
                )
            ]
        )