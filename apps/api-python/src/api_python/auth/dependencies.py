from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api_python.auth.security import (
    decode_access_token,
)
from api_python.auth.service import AuthService
from api_python.database import get_db
from api_python.models.user import User


bearer_scheme = HTTPBearer(
    auto_error=False,
)


async def get_auth_service(
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> AuthService:
    return AuthService(session)


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        payload = decode_access_token(
            credentials.credentials
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    user_id = payload.get("sub")

    result = await session.execute(
        select(User).where(
            User.id == user_id
        )
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    return user


AuthServiceDependency = Annotated[
    AuthService,
    Depends(get_auth_service),
]

CurrentUser = Annotated[
    User,
    Depends(get_current_user),
]