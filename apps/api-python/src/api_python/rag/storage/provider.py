from functools import lru_cache

from api_python.config import settings
from api_python.rag.storage.base import (
    RagFileStorageService,
)
from api_python.rag.storage.local import (
    LocalRagFileStorageService,
)
from api_python.rag.storage.s3 import (
    S3RagFileStorageService,
)


@lru_cache(maxsize=1)
def get_rag_file_storage(
) -> RagFileStorageService:
    storage_type = (
        settings.rag_file_storage
        or "local"
    ).lower()

    if storage_type == "local":
        return (
            LocalRagFileStorageService()
        )

    if storage_type == "s3":
        return (
            S3RagFileStorageService()
        )

    raise ValueError(
        "지원하지 않는 RAG 파일 저장소입니다: "
        f"RAG_FILE_STORAGE={storage_type}"
    )