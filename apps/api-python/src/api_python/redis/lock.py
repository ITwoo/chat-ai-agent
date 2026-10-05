from dataclasses import dataclass
from uuid import uuid4

from api_python.redis.client import RedisService, redis_service


RELEASE_LOCK_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
"""


@dataclass(frozen=True, slots=True)
class RedisLock:
    key: str
    token: str


class RedisLockService:
    def __init__(
        self,
        redis_service: RedisService,
    ) -> None:
        self._redis_service = redis_service

    async def acquire(
        self,
        key: str,
        ttl_ms: int,
    ) -> RedisLock | None:
        token = str(uuid4())

        acquired = await self._redis_service.get_client().set(
            key,
            token,
            px=ttl_ms,
            nx=True,
        )

        if not acquired:
            return None

        return RedisLock(
            key=key,
            token=token,
        )

    async def release(
        self,
        lock: RedisLock,
    ) -> bool:
        result = await self._redis_service.get_client().eval(
            RELEASE_LOCK_SCRIPT,
            1,
            lock.key,
            lock.token,
        )

        return int(result) == 1


redis_lock_service = RedisLockService(
    redis_service,
)