from fastapi import (
    APIRouter,
    Request,
    Response,
    status,
)

from api_python.auth.dependencies import (
    AuthServiceDependency,
    CurrentUser,
)
from api_python.auth.schemas import (
    AuthCredential,
    LoginResponse,
    UserResponse,
)
from api_python.config import settings
from api_python.redis import (
    redis_rate_limit_service,
)


SIGNIN_RATE_LIMIT = 10
SIGNIN_RATE_LIMIT_WINDOW_MS = 60_000

REFRESH_COOKIE_NAME = "refreshToken"
REFRESH_COOKIE_PATH = "/api/auth"


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


def get_same_site() -> str:
    if settings.node_env == "production":
        return "lax"

    return "none"


@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
    response_class=Response,
)
async def sign_up(
    credential: AuthCredential,
    auth_service: AuthServiceDependency,
) -> Response:
    await auth_service.sign_up(
        credential
    )

    return Response(
        status_code=status.HTTP_201_CREATED,
    )


@router.post(
    "/signin",
    status_code=status.HTTP_201_CREATED,
    response_model=LoginResponse,
)
async def sign_in(
    credential: AuthCredential,
    response: Response,
    auth_service: AuthServiceDependency,
) -> LoginResponse:
    rate_limit = (
        await redis_rate_limit_service.consume(
            (
                "rate-limit:signin:"
                f"{credential.username}"
            ),
            SIGNIN_RATE_LIMIT,
            SIGNIN_RATE_LIMIT_WINDOW_MS,
        )
    )

    if not rate_limit.allowed:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=429,
            detail=(
                "로그인 시도가 너무 많습니다. "
                "잠시 후 다시 시도해주세요."
            ),
        )

    result = await auth_service.sign_in(
        credential
    )

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result.refresh_token,
        httponly=True,
        secure=True,
        samesite=get_same_site(),
        path=REFRESH_COOKIE_PATH,
        max_age=int(
            settings.jwt_refresh_expires_in
        ),
    )

    return LoginResponse(
        access_token=result.access_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_201_CREATED,
    response_class=Response,
)
async def logout(
    request: Request,
    auth_service: AuthServiceDependency,
) -> Response:
    refresh_token = request.cookies.get(
        REFRESH_COOKIE_NAME
    )

    if refresh_token:
        await auth_service.logout(
            refresh_token
        )

    response = Response(
        status_code=status.HTTP_201_CREATED,
    )

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite=get_same_site(),
        path=REFRESH_COOKIE_PATH,
    )

    return response


@router.post(
    "/refresh",
    status_code=status.HTTP_201_CREATED,
    response_model=LoginResponse,
)
async def refresh(
    request: Request,
    response: Response,
    auth_service: AuthServiceDependency,
) -> LoginResponse:
    from fastapi import HTTPException

    refresh_token = request.cookies.get(
        REFRESH_COOKIE_NAME
    )

    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Refresh token not found",
        )

    result = (
        await auth_service.refresh_access_token(
            refresh_token
        )
    )

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result.refresh_token,
        httponly=True,
        secure=True,
        samesite=get_same_site(),
        path=REFRESH_COOKIE_PATH,
        max_age=(
            result
            .refresh_token_expires_in_seconds
        ),
    )

    return LoginResponse(
        access_token=result.access_token,
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
async def get_me(
    user: CurrentUser,
) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
    )