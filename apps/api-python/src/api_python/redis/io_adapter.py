import socketio

from api_python.config import settings


socket_manager = socketio.AsyncRedisManager(
    settings.redis_url,
)