from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api_python.chat.service import ChatService
from api_python.database import get_db


def get_chat_service(
    session: Annotated[
        AsyncSession,
        Depends(get_db),
    ],
) -> ChatService:
    return ChatService(session)


ChatServiceDependency = Annotated[
    ChatService,
    Depends(get_chat_service),
]