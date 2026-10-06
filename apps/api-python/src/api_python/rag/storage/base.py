from abc import ABC, abstractmethod


class RagFileStorageService(
    ABC
):
    @abstractmethod
    async def write(
        self,
        storage_key: str,
        data: bytes,
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    async def read(
        self,
        storage_key: str,
    ) -> bytes | None:
        raise NotImplementedError

    @abstractmethod
    async def exists(
        self,
        storage_key: str,
    ) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def delete(
        self,
        storage_key: str,
    ) -> None:
        raise NotImplementedError