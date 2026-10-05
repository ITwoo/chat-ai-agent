from typing import Annotated

from fastapi import (
    APIRouter,
    Query,
    Response,
    status,
)

from api_python.auth.dependencies import CurrentUser
from api_python.chat.dependencies import (
    ChatServiceDependency,
)
from api_python.chat.schemas import (
    ChatMessageResponse,
    ChatMessagesPageResponse,
    ChatRoomResponse,
    CreateChatRoomRequest,
    GetChatMessagesQuery,
    UpdateChatRoomRequest,
)


router = APIRouter(
    prefix="/chat",
    tags=["chat"],
)


@router.post(
    "/rooms",
    response_model=ChatRoomResponse,
    response_model_by_alias=True,
)
async def create_room(
    request: CreateChatRoomRequest,
    user: CurrentUser,
    chat_service: ChatServiceDependency,
) -> ChatRoomResponse:
    room = await chat_service.create_room(
        user,
        request.title,
    )

    return ChatRoomResponse.model_validate(room)


@router.get(
    "/rooms",
    response_model=list[ChatRoomResponse],
    response_model_by_alias=True,
)
async def get_rooms(
    user: CurrentUser,
    chat_service: ChatServiceDependency,
) -> list[ChatRoomResponse]:
    rooms = await chat_service.get_rooms(user)

    return [
        ChatRoomResponse.model_validate(room)
        for room in rooms
    ]


@router.get(
    "/rooms/{room_id}/messages",
    response_model=ChatMessagesPageResponse,
    response_model_by_alias=True,
)
async def get_messages(
    room_id: int,
    user: CurrentUser,
    chat_service: ChatServiceDependency,
    query: Annotated[
        GetChatMessagesQuery,
        Query(),
    ],
) -> ChatMessagesPageResponse:
    result = await chat_service.get_messages(
        room_id,
        user,
        cursor=query.cursor,
        limit=query.limit,
    )

    return ChatMessagesPageResponse(
        messages=[
            ChatMessageResponse.model_validate(message)
            for message in result.messages
        ],
        next_cursor=result.next_cursor,
    )


@router.patch(
    "/rooms/{room_id}",
    response_model=ChatRoomResponse,
    response_model_by_alias=True,
)
async def update_room_title(
    room_id: int,
    request: UpdateChatRoomRequest,
    user: CurrentUser,
    chat_service: ChatServiceDependency,
) -> ChatRoomResponse:
    room = await chat_service.update_room_title(
        room_id,
        user.id,
        request.title,
    )

    return ChatRoomResponse.model_validate(room)


@router.delete(
    "/rooms/{room_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_room(
    room_id: int,
    user: CurrentUser,
    chat_service: ChatServiceDependency,
) -> Response:
    await chat_service.delete_room(
        room_id,
        user.id,
    )

    return Response(
        status_code=status.HTTP_200_OK,
    )