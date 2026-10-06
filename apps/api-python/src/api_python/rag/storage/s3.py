import aioboto3
from botocore.exceptions import (
    ClientError,
)

from api_python.config import settings
from api_python.rag.storage.base import (
    RagFileStorageService,
)


class S3RagFileStorageService(
    RagFileStorageService
):
    def __init__(self) -> None:
        self._bucket = (
            settings.rag_s3_bucket
        )

        self._prefix = (
            settings.rag_s3_prefix
            .strip("/")
        )

        self._region = (
            settings.aws_region
        )

        if not self._bucket:
            raise ValueError(
                "RAG_S3_BUCKET 환경변수가 필요합니다."
            )

        if not self._region:
            raise ValueError(
                "AWS_REGION 환경변수가 필요합니다."
            )

        self._session = (
            aioboto3.Session()
        )

    def _get_object_key(
        self,
        storage_key: str,
    ) -> str:
        if self._prefix:
            return (
                f"{self._prefix}/"
                f"{storage_key}"
            )

        return storage_key

    @staticmethod
    def _is_not_found(
        error: ClientError,
    ) -> bool:
        status_code = (
            error.response
            .get(
                "ResponseMetadata",
                {},
            )
            .get("HTTPStatusCode")
        )

        return status_code == 404

    async def write(
        self,
        storage_key: str,
        data: bytes,
    ) -> None:
        async with self._session.client(
            "s3",
            region_name=self._region,
        ) as client:
            await client.put_object(
                Bucket=self._bucket,
                Key=self._get_object_key(
                    storage_key
                ),
                Body=data,
            )

    async def read(
        self,
        storage_key: str,
    ) -> bytes | None:
        try:
            async with self._session.client(
                "s3",
                region_name=self._region,
            ) as client:
                response = (
                    await client.get_object(
                        Bucket=self._bucket,
                        Key=self._get_object_key(
                            storage_key
                        ),
                    )
                )

                body = response.get(
                    "Body"
                )

                if body is None:
                    return b""

                return await body.read()

        except ClientError as error:
            if self._is_not_found(error):
                return None

            raise

    async def exists(
        self,
        storage_key: str,
    ) -> bool:
        try:
            async with self._session.client(
                "s3",
                region_name=self._region,
            ) as client:
                await client.head_object(
                    Bucket=self._bucket,
                    Key=self._get_object_key(
                        storage_key
                    ),
                )

                return True

        except ClientError as error:
            if self._is_not_found(error):
                return False

            raise

    async def delete(
        self,
        storage_key: str,
    ) -> None:
        async with self._session.client(
            "s3",
            region_name=self._region,
        ) as client:
            await client.delete_object(
                Bucket=self._bucket,
                Key=self._get_object_key(
                    storage_key
                ),
            )