import io
import logging
import re

from pypdf import PdfReader
from pypdf.errors import (
    FileNotDecryptedError,
    PdfReadError,
)

from api_python.queue.errors import (
    UnrecoverableJobError,
)
from api_python.rag.extractors.base import (
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagExtractedSection,
)


logger = logging.getLogger(
    "RagPdfFileExtractor"
)


class RagPdfFileExtractor:
    def supports(
        self,
        extension: str,
    ) -> bool:
        return extension == ".pdf"

    async def extract(
        self,
        input_data: (
            RagDocumentExtractionInput
        ),
    ) -> RagDocumentExtractionResult:
        try:
            reader = PdfReader(
                io.BytesIO(input_data.data)
            )

            if reader.is_encrypted:
                try:
                    result = reader.decrypt("")
                except Exception as error:
                    raise UnrecoverableJobError(
                        "암호로 보호된 PDF는 현재 처리할 수 없습니다."
                    ) from error

                if result == 0:
                    raise UnrecoverableJobError(
                        "암호로 보호된 PDF는 현재 처리할 수 없습니다."
                    )

            sections: list[
                RagExtractedSection
            ] = []

            for page_number, page in enumerate(
                reader.pages,
                start=1,
            ):
                text = page.extract_text() or ""

                content = self._normalize_text(
                    text
                )

                if not content:
                    continue

                sections.append(
                    RagExtractedSection(
                        content=content,
                        page_number=page_number,
                    )
                )

            if not sections:
                raise UnrecoverableJobError(
                    "PDF에서 추출할 텍스트를 찾을 수 없습니다. "
                    "이미지로만 구성된 스캔 PDF는 현재 지원하지 않습니다."
                )

            return RagDocumentExtractionResult(
                sections=sections
            )

        except UnrecoverableJobError:
            raise

        except (
            FileNotDecryptedError,
            PdfReadError,
        ) as error:
            logger.exception(
                "PDF 텍스트 추출 실패: storageKey=%s",
                input_data.storage_key,
            )

            raise UnrecoverableJobError(
                "PDF 파일이 손상됐거나 지원하지 않는 형식이어서 "
                "텍스트를 추출할 수 없습니다."
            ) from error

        except Exception as error:
            logger.exception(
                "PDF 텍스트 추출 실패: storageKey=%s",
                input_data.storage_key,
            )

            raise UnrecoverableJobError(
                "PDF 파일이 손상됐거나 지원하지 않는 형식이어서 "
                "텍스트를 추출할 수 없습니다."
            ) from error

    @staticmethod
    def _normalize_text(
        text: str,
    ) -> str:
        text = text.replace(
            "\r\n",
            "\n",
        ).replace(
            "\r",
            "\n",
        )

        text = text.replace(
            "\u00a0",
            " ",
        )

        text = re.sub(
            r"[\u200b-\u200d\ufeff]",
            "",
            text,
        )

        text = text.replace(
            "\x00",
            "",
        )

        text = re.sub(
            r"[ \t]+\n",
            "\n",
            text,
        )

        text = re.sub(
            r"\n[ \t]+",
            "\n",
            text,
        )

        text = re.sub(
            r"[ \t]{2,}",
            " ",
            text,
        )

        text = re.sub(
            r"\n{3,}",
            "\n\n",
            text,
        )

        return text.strip()