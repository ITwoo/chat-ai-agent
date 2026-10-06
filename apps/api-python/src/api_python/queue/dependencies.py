from typing import Annotated

from fastapi import Depends

from api_python.queue.producer import (
    QueueProducerService,
    queue_producer_service,
)


def get_queue_producer_service(
) -> QueueProducerService:
    return queue_producer_service


QueueProducerDependency = Annotated[
    QueueProducerService,
    Depends(
        get_queue_producer_service
    ),
]