from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api_python.boards.service import (
    BoardsService,
)
from api_python.database import get_db


def get_boards_service(
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> BoardsService:
    return BoardsService(
        session,
    )


BoardsServiceDependency = Annotated[
    BoardsService,
    Depends(get_boards_service),
]