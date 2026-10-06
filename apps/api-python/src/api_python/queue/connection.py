from arq.connections import RedisSettings

from api_python.config import settings


queue_redis_settings = (
    RedisSettings.from_dsn(
        settings.redis_url
    )
)