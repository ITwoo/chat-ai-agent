from fastapi import APIRouter

from api_python.auth import (
    router as auth_router,
)
from api_python.boards import (
    router as boards_router,
)
from api_python.chat import (
    router as chat_router,
)
from api_python.health import (
    router as health_router,
)
from api_python.rag import (
    documents_router,
    search_router,
)


api_router = APIRouter(
    prefix="/api",
)


api_router.include_router(
    auth_router,
)

api_router.include_router(
    boards_router,
)

api_router.include_router(
    chat_router,
)

api_router.include_router(
    documents_router,
)

api_router.include_router(
    search_router,
)

api_router.include_router(
    health_router,
)