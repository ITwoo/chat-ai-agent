import json
import logging

from api_python.config import settings
from api_python.observability.request_context import (
    get_request_id,
)


class RequestContextFilter(logging.Filter):
    def filter(
        self,
        record: logging.LogRecord,
    ) -> bool:
        record.request_id = get_request_id()

        return True


class JsonFormatter(logging.Formatter):
    def format(
        self,
        record: logging.LogRecord,
    ) -> str:
        log = {
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }

        request_id = getattr(
            record,
            "request_id",
            None,
        )

        if request_id is not None:
            log["requestId"] = request_id

        if record.exc_info:
            log["exception"] = self.formatException(
                record.exc_info
            )

        return json.dumps(
            log,
            ensure_ascii=False,
        )


class ConsoleFormatter(logging.Formatter):
    def format(
        self,
        record: logging.LogRecord,
    ) -> str:
        request_id = getattr(
            record,
            "request_id",
            None,
        )

        prefix = (
            f"[{request_id}] "
            if request_id
            else ""
        )

        message = (
            f"{record.levelname} "
            f"[{record.name}] "
            f"{prefix}"
            f"{record.getMessage()}"
        )

        if record.exc_info:
            message += (
                "\n"
                + self.formatException(
                    record.exc_info
                )
            )

        return message


def configure_logging() -> None:
    handler = logging.StreamHandler()

    handler.addFilter(
        RequestContextFilter()
    )

    if settings.node_env == "production":
        handler.setFormatter(
            JsonFormatter()
        )
    else:
        handler.setFormatter(
            ConsoleFormatter()
        )

    root_logger = logging.getLogger()

    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)