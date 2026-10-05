from dataclasses import dataclass

from api_python.redis.client import RedisService, redis_service


RATE_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])

if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
"""


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_ms: int


class RedisRateLimitService:
    def __init__(
        self,
        redis_service: RedisService,
    ) -> None:
        self._redis_service = redis_service

    async def consume(
        self,
        key: str,
        limit: int,
        window_ms: int,
    ) -> RateLimitResult:
        result = await self._redis_service.get_client().eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            window_ms,
        )

        count, ttl = (
            int(result[0]),
            int(result[1]),
        )

        allowed = count <= limit

        return RateLimitResult(
            allowed=allowed,
            remaining=max(limit - count, 0),
            retry_after_ms=(
                0
                if allowed
                else max(ttl, 0)
            ),
        )


redis_rate_limit_service = RedisRateLimitService(
    redis_service,
)