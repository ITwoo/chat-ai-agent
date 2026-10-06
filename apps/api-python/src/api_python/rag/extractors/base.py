from dataclasses import dataclass
from typing import Protocol


@dataclass(
    slots=True,
    frozen=True,
)
class RagDocumentExtractionInput:
    data: bytes
    storage_key: str
    extension: str


@dataclass(
    slots=True,
    frozen=True,
)
class RagExtractedSection:
    content: str
    page_number: int | None


@dataclass(
    slots=True,
    frozen=True,
)
class RagDocumentExtractionResult:
    sections: list[
        RagExtractedSection
    ]


class RagDocumentTextExtractor(
    Protocol
):
    def supports(
        self,
        extension: str,
    ) -> bool: ...

    async def extract(
        self,
        input_data: (
            RagDocumentExtractionInput
        ),
    ) -> RagDocumentExtractionResult: ...