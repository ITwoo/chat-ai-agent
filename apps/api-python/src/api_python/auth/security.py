import time
from uuid import uuid4

import bcrypt
import jwt
from anyio import to_thread
from jwt import InvalidTokenError

from api_python.config import settings


JWT_ALGORITHM = "HS256"
BCRYPT_ROUNDS = 10
BCRYPT_MAX_BYTES = 72


def _bcrypt_bytes(value: str) -> bytes:
    return value.encode("utf-8")[:BCRYPT_MAX_BYTES]


async def hash_password(password: str) -> str:
    password_bytes = _bcrypt_bytes(password)

    hashed = await to_thread.run_sync(
        bcrypt.hashpw,
        password_bytes,
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS),
    )

    return hashed.decode("utf-8")


async def verify_password(
    password: str,
    password_hash: str,
) -> bool:
    return await to_thread.run_sync(
        bcrypt.checkpw,
        _bcrypt_bytes(password),
        password_hash.encode("utf-8"),
    )


async def hash_refresh_token(
    refresh_token: str,
) -> str:
    hashed = await to_thread.run_sync(
        bcrypt.hashpw,
        _bcrypt_bytes(refresh_token),
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS),
    )

    return hashed.decode("utf-8")


async def verify_refresh_token_hash(
    refresh_token: str,
    token_hash: str,
) -> bool:
    return await to_thread.run_sync(
        bcrypt.checkpw,
        _bcrypt_bytes(refresh_token),
        token_hash.encode("utf-8"),
    )


def create_access_token(
    user_id: int,
    username: str,
) -> str:
    now = int(time.time())

    payload = {
        "sub": user_id,
        "username": username,
        "iat": now,
        "exp": now + int(settings.jwt_expires_in),
    }

    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(
    user_id: int,
    username: str,
    expires_in_seconds: int,
) -> str:
    now = int(time.time())

    payload = {
        "sub": user_id,
        "username": username,
        "iat": now,
        "exp": now + expires_in_seconds,
        "jti": str(uuid4()),
    }

    return jwt.encode(
        payload,
        settings.jwt_refresh_secret,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(
    token: str,
) -> dict:
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[JWT_ALGORITHM],
        options={
            "verify_sub": False,
        },
    )


def decode_refresh_token(
    token: str,
) -> dict:
    return jwt.decode(
        token,
        settings.jwt_refresh_secret,
        algorithms=[JWT_ALGORITHM],
        options={
            "verify_sub": False,
        },
    )


def is_invalid_token_error(
    error: Exception,
) -> bool:
    return isinstance(error, InvalidTokenError)