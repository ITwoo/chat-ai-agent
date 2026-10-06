from typing import NoReturn

from arq import Retry

from api_python.queue.constants import (
    JOB_BACKOFF_BASE_SECONDS,
    JOB_MAX_ATTEMPTS,
)
from api_python.queue.errors import (
    UnrecoverableJobError,
)


def retry_or_raise(
    context: dict,
    error: Exception,
) -> NoReturn:
    current_attempt = int(
        context["job_try"]
    )

    if isinstance(
        error,
        UnrecoverableJobError,
    ):
        raise error

    if (
        current_attempt
        >= JOB_MAX_ATTEMPTS
    ):
        raise error

    delay_seconds = (
        JOB_BACKOFF_BASE_SECONDS
        * 2 ** (
            current_attempt - 1
        )
    )

    raise Retry(
        defer=delay_seconds
    ) from error