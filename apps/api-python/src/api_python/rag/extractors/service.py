from pathlib import Path

from api_python.queue.errors import (
    UnrecoverableJobError,
)
from api_python.rag.extractors.base import (
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagDocumentTextExtractor,
)
from api_python.rag.extractors.pdf import (
    RagPdfFileExtractor,
)
from api_python.rag.extractors.text import (
    RagTextFileExtractor,
)
from api_python.rag.storage.base import (
    RagFileStorageService,
)


FILE_SIGNATURE_SAMPLE_SIZE = (
    8 * 1024
)

PDF_SIGNATURE = b"%PDF-"


class RagDocumentExtractorService:
    def __init__(
        self,
        storage: RagFileStorageService,
    ) -> None:
        self._storage = storage

        self._extractors: list[
            RagDocumentTextExtractor
        ] = [
            RagTextFileExtractor(),
            RagPdfFileExtractor(),
        ]

    async def extract(
        self,
        storage_key: str,
    ) -> RagDocumentExtractionResult:
        extension = (
            Path(storage_key)
            .suffix
            .lower()
        )

        extractor = next(
            (
                candidate
                for candidate
                in self._extractors
                if candidate.supports(
                    extension
                )
            ),
            None,
        )

        if extractor is None:
            raise UnrecoverableJobError(
                "지원하지 않는 RAG 문서 형식입니다: "
                f"extension={extension or '없음'}"
            )

        data = await self._storage.read(
            storage_key
        )

        if data is None:
            raise UnrecoverableJobError(
                "RAG 원본 파일을 찾을 수 없습니다: "
                f"storageKey={storage_key}"
            )

        input_data = (
            RagDocumentExtractionInput(
                data=data,
                storage_key=storage_key,
                extension=extension,
            )
        )

        self._validate_file_content(
            input_data
        )

        return await extractor.extract(
            input_data
        )

    def _validate_file_content(
        self,
        input_data: (
            RagDocumentExtractionInput
        ),
    ) -> None:
        sample = input_data.data[
            :FILE_SIGNATURE_SAMPLE_SIZE
        ]

        if (
            input_data.extension
            == ".pdf"
        ):
            if not sample.startswith(
                PDF_SIGNATURE
            ):
                raise UnrecoverableJobError(
                    "확장자는 .pdf이지만 실제 파일 내용이 PDF 형식이 아닙니다."
                )

            return

        if (
            input_data.extension
            == ".txt"
        ):
            if not sample:
                raise UnrecoverableJobError(
                    "RAG 문서가 비어 있습니다."
                )

            if b"\x00" in sample:
                raise UnrecoverableJobError(
                    "확장자는 .txt이지만 바이너리 파일로 판단되어 처리할 수 없습니다."
                )

            if sample.startswith(
                PDF_SIGNATURE
            ):
                raise UnrecoverableJobError(
                    "실제 PDF 파일을 .txt 확장자로 업로드할 수 없습니다."
                )