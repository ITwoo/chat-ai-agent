import socketio

from api_python.redis.io_adapter import socket_manager


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://www.woohyuk.dev",
]


sio = socketio.AsyncServer(
    async_mode="asgi",
    client_manager=socket_manager,
    cors_allowed_origins=ALLOWED_ORIGINS,
)