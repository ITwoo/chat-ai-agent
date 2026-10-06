import asyncio
from pathlib import Path

from api_python.config import settings
from api_python.rag.storage.base import (
    RagFileStorageService,
)


class LocalRagFileStorageService(
    RagFileStorageService
):
    def __init__(self) -> None:
        self._upload_dir = (
            Path.cwd()
            / settings.rag_upload_dir
        ).resolve()

    def _get_file_path(
        self,
        storage_key: str,
    ) -> Path:
        file_path = (
            self._upload_dir
            / storage_key
        ).resolve()

        try:
            file_path.relative_to(
                self._upload_dir
            )
        except ValueError as error:
            raise ValueError(
                "허용되지 않는 RAG storageKey입니다: "
                f"{storage_key}"
            ) from error

        return file_path

    async def write(
        self,
        storage_key: str,
        data: bytes,
    ) -> None:
        file_path = self._get_file_path(
            storage_key
        )

        await asyncio.to_thread(
            self._upload_dir.mkdir,
            parents=True,
            exist_ok=True,
        )

        await asyncio.to_thread(
            file_path.write_bytes,
            data,
        )

    async def read(
        self,
        storage_key: str,
    ) -> bytes | None:
        file_path = self._get_file_path(
            storage_key
        )

        try:
            return await asyncio.to_thread(
                file_path.read_bytes
            )
        except FileNotFoundError:
            return None

    async def exists(
        self,
        storage_key: str,
    ) -> bool:
        file_path = self._get_file_path(
            storage_key
        )

        return await asyncio.to_thread(
            file_path.exists
        )

    async def delete(
        self,
        storage_key: str,
    ) -> None:
        file_path = self._get_file_path(
            storage_key
        )

        try:
            await asyncio.to_thread(
                file_path.unlink
            )
        except FileNotFoundError:
            return