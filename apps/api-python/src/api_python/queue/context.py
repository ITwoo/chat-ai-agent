from contextlib import contextmanager
from collections.abc import Iterator

from api_python.observability.request_context import (
    reset_request_id,
    set_request_id,
)


@contextmanager
def job_request_context(
    request_id: str | None,
) -> Iterator[None]:
    if request_id is None:
        yield
        return

    token = set_request_id(
        request_id
    )

    try:
        yield

    finally:
        reset_request_id(
            token
        )