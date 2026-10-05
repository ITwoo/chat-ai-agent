from contextvars import ContextVar
from typing import Callable, TypeVar


T = TypeVar("T")

_request_id: ContextVar[str | None] = ContextVar(
    "request_id",
    default=None,
)


def get_request_id() -> str | None:
    return _request_id.get()


def run_with_request_id(
    request_id: str | None,
    callback: Callable[[], T],
) -> T:
    if request_id is None:
        return callback()

    token = _request_id.set(request_id)

    try:
        return callback()
    finally:
        _request_id.reset(token)


def set_request_id(
    request_id: str,
):
    return _request_id.set(request_id)


def reset_request_id(token) -> None:
    _request_id.reset(token)