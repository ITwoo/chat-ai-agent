from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"


async def integrity_error_handler(
    request: Request,
    exception: IntegrityError,
) -> JSONResponse:
    driver_exception = exception.driver_exception

    sqlstate = getattr(
        driver_exception,
        "sqlstate",
        None,
    )

    if sqlstate == UNIQUE_VIOLATION:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "message": "이미 존재하는 데이터입니다.",
            },
        )

    if sqlstate == FOREIGN_KEY_VIOLATION:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "message": "잘못된 참조 데이터입니다.",
            },
        )

    raise exception