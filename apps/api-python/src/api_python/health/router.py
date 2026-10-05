import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api_python.database import engine
from api_python.redis import redis_service


router = APIRouter(
    prefix="/health",
    tags=["health"],
)


@router.get("/live")
async def get_liveness():
    return {
        "status": "ok",
    }


async def _check_database() -> None:
    async with engine.connect() as connection:
        await connection.execute(
            text("SELECT 1")
        )


async def _check_redis() -> None:
    await redis_service.get_client().ping()


@router.get("/ready")
async def get_readiness():
    database_result, redis_result = await asyncio.gather(
        _check_database(),
        _check_redis(),
        return_exceptions=True,
    )

    checks = {
        "database": (
            "down"
            if isinstance(database_result, BaseException)
            else "up"
        ),
        "redis": (
            "down"
            if isinstance(redis_result, BaseException)
            else "up"
        ),
    }

    if (
        checks["database"] == "down"
        or checks["redis"] == "down"
    ):
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "checks": checks,
            },
        )

    return {
        "status": "ok",
        "checks": checks,
    }


@router.get("")
async def get_health():
    return await get_readiness()