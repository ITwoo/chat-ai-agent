from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api_python.auth.schemas import AuthCredential
from api_python.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
    verify_refresh_token_hash,
)
from api_python.config import settings
from api_python.models.auth import RefreshTokenSession
from api_python.models.user import User


@dataclass(frozen=True, slots=True)
class SignInResult:
    access_token: str
    refresh_token: str


@dataclass(frozen=True, slots=True)
class RefreshTokenResult:
    access_token: str
    refresh_token: str
    refresh_token_expires_in_seconds: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(
        tzinfo=None,
    )


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self._session = session

    async def sign_up(
        self,
        credential: AuthCredential,
    ) -> None:
        result = await self._session.execute(
            select(User).where(
                User.username == credential.username
            )
        )

        user = result.scalar_one_or_none()

        if user is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Username already exists",
            )

        hashed_password = await hash_password(
            credential.password
        )

        self._session.add(
            User(
                username=credential.username,
                password=hashed_password,
            )
        )

        await self._session.commit()

    async def sign_in(
        self,
        credential: AuthCredential,
    ) -> SignInResult:
        result = await self._session.execute(
            select(User).where(
                User.username == credential.username
            )
        )

        user = result.scalar_one_or_none()

        if (
            user is None
            or not await verify_password(
                credential.password,
                user.password,
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        access_token = create_access_token(
            user.id,
            user.username,
        )

        refresh_expires_in = int(
            settings.jwt_refresh_expires_in
        )

        refresh_token = create_refresh_token(
            user.id,
            user.username,
            refresh_expires_in,
        )

        await self._save_refresh_token_session(
            user.id,
            refresh_token,
            refresh_expires_in,
        )

        await self._session.commit()

        return SignInResult(
            access_token=access_token,
            refresh_token=refresh_token,
        )

    async def refresh_access_token(
        self,
        refresh_token: str,
    ) -> RefreshTokenResult:
        try:
            payload = decode_refresh_token(
                refresh_token
            )
        except Exception:
            raise self._invalid_refresh_token()

        user_id = payload.get("sub")

        result = await self._session.execute(
            select(User).where(
                User.id == user_id
            )
        )

        user = result.scalar_one_or_none()

        if user is None:
            raise self._invalid_refresh_token()

        now = utc_now()

        result = await self._session.execute(
            select(RefreshTokenSession).where(
                RefreshTokenSession.user_id
                == user.id,
                RefreshTokenSession.revoked_at
                .is_(None),
                RefreshTokenSession.expires_at
                > now,
            )
        )

        sessions = result.scalars().all()

        matched_session = (
            await self._find_matched_session(
                refresh_token,
                sessions,
            )
        )

        if matched_session is None:
            raise self._invalid_refresh_token()

        remaining_seconds = int(
            (
                matched_session.expires_at
                - now
            ).total_seconds()
        )

        if remaining_seconds <= 0:
            raise self._invalid_refresh_token()

        access_token = create_access_token(
            user.id,
            user.username,
        )

        next_refresh_token = (
            create_refresh_token(
                user.id,
                user.username,
                remaining_seconds,
            )
        )

        next_token_hash = (
            await hash_refresh_token(
                next_refresh_token
            )
        )

        result = await self._session.execute(
            update(RefreshTokenSession)
            .where(
                RefreshTokenSession.id
                == matched_session.id,
                RefreshTokenSession.token_hash
                == matched_session.token_hash,
                RefreshTokenSession.revoked_at
                .is_(None),
                RefreshTokenSession.expires_at
                > now,
            )
            .values(
                token_hash=next_token_hash,
            )
        )

        if result.rowcount != 1:
            await self._session.rollback()

            raise self._invalid_refresh_token()

        await self._session.commit()

        return RefreshTokenResult(
            access_token=access_token,
            refresh_token=next_refresh_token,
            refresh_token_expires_in_seconds=(
                remaining_seconds
            ),
        )

    async def logout(
        self,
        refresh_token: str,
    ) -> None:
        try:
            payload = decode_refresh_token(
                refresh_token
            )
        except Exception:
            return

        user_id = payload.get("sub")
        now = utc_now()

        result = await self._session.execute(
            select(RefreshTokenSession).where(
                RefreshTokenSession.user_id
                == user_id,
                RefreshTokenSession.revoked_at
                .is_(None),
                RefreshTokenSession.expires_at
                > now,
            )
        )

        sessions = result.scalars().all()

        matched_session = (
            await self._find_matched_session(
                refresh_token,
                sessions,
            )
        )

        if matched_session is None:
            return

        matched_session.revoked_at = now

        await self._session.commit()

    async def _save_refresh_token_session(
        self,
        user_id: int,
        refresh_token: str,
        expires_in_seconds: int,
    ) -> None:
        token_hash = await hash_refresh_token(
            refresh_token
        )

        expires_at = utc_now()

        expires_at = datetime.fromtimestamp(
            expires_at.timestamp()
            + expires_in_seconds,
        )

        self._session.add(
            RefreshTokenSession(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )

    async def _find_matched_session(
        self,
        refresh_token: str,
        sessions: list[RefreshTokenSession],
    ) -> RefreshTokenSession | None:
        for session in sessions:
            matched = (
                await verify_refresh_token_hash(
                    refresh_token,
                    session.token_hash,
                )
            )

            if matched:
                return session

        return None

    @staticmethod
    def _invalid_refresh_token() -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )