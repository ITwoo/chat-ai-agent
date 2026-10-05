import logging

from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff
from redis.exceptions import ConnectionError, TimeoutError

from api_python.config import settings


logger = logging.getLogger(__name__)


class RedisService:
    def __init__(self) -> None:
        self._client: Redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5.0,
            protocol=2,
            retry=Retry(
                NoBackoff(),
                1,
                supported_errors=(
                    ConnectionError,
                    TimeoutError,
                ),
            ),
        )

    async def connect(self) -> None:
        response = await self._client.ping()
        logger.info("Redis 연결 완료: %s", response)

    async def close(self) -> None:
        await self._client.aclose()

    def get_client(self) -> Redis:
        return self._client


redis_service = RedisService()