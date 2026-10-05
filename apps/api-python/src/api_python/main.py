import logging
from contextlib import asynccontextmanager
from uuid import uuid4

import socketio
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

from api_python.chat.socket import sio
from api_python.config import settings
from api_python.database import engine
from api_python.database_exceptions import (
    integrity_error_handler,
)
from api_python.observability import (
    configure_logging,
    reset_request_id,
    set_request_id,
)
from api_python.redis import redis_service
from api_python.router import api_router


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://www.woohyuk.dev",
]


configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_service.connect()

    logger.info("애플리케이션 시작")

    try:
        yield

    finally:
        await redis_service.close()
        await engine.dispose()

        logger.info("애플리케이션 종료")


fastapi_app = FastAPI(
    lifespan=lifespan,
)


fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "HEAD",
        "PUT",
        "PATCH",
        "POST",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=["*"],
)


@fastapi_app.middleware("http")
async def request_context_middleware(
    request: Request,
    call_next,
):
    request_id = str(uuid4())

    token = set_request_id(request_id)

    try:
        response = await call_next(request)

        response.headers[
            "X-Request-Id"
        ] = request_id

        return response

    finally:
        reset_request_id(token)


fastapi_app.add_exception_handler(
    IntegrityError,
    integrity_error_handler,
)


fastapi_app.include_router(
    api_router,
)


app = socketio.ASGIApp(
    sio,
    fastapi_app,
)


def run() -> None:
    logger.info(
        "Config File Name %s",
        settings.env_name,
    )

    uvicorn.run(
        "api_python.main:app",
        host="0.0.0.0",
        port=settings.port,
    )