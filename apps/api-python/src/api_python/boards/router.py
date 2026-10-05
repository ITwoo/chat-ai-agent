import logging

from fastapi import (
    APIRouter,
    Response,
    status,
)

from api_python.auth.dependencies import (
    CurrentUser,
)
from api_python.boards.dependencies import (
    BoardsServiceDependency,
)
from api_python.boards.schemas import (
    BoardResponse,
    CreateBoardRequest,
    UpdateBoardRequest,
    UpdateBoardStatusRequest,
)


logger = logging.getLogger(
    "BoardsController"
)


router = APIRouter(
    prefix="/boards",
    tags=["boards"],
)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=BoardResponse,
    response_model_by_alias=True,
)
async def create_board(
    request: CreateBoardRequest,
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> BoardResponse:
    logger.info(
        'User "%s" creating a new board.',
        user.username,
    )

    board = await boards_service.create_board(
        request,
        user,
    )

    return BoardResponse.model_validate(
        board
    )


@router.get(
    "/{board_id}",
    response_model=BoardResponse,
    response_model_by_alias=True,
)
async def get_board_by_id(
    board_id: int,
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> BoardResponse:
    logger.info(
        'User "%s" getting board "%s".',
        user.username,
        board_id,
    )

    board = (
        await boards_service.get_board_by_id(
            board_id,
            user.id,
        )
    )

    return BoardResponse.model_validate(
        board
    )


@router.delete(
    "/{board_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_board(
    board_id: int,
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> Response:
    logger.info(
        'User "%s" deleting board "%s".',
        user.username,
        board_id,
    )

    await boards_service.delete_board(
        board_id,
        user.id,
    )

    return Response(
        status_code=status.HTTP_200_OK,
    )


@router.patch(
    "/{board_id}",
    response_model=BoardResponse,
    response_model_by_alias=True,
)
async def update_board(
    board_id: int,
    request: UpdateBoardRequest,
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> BoardResponse:
    logger.info(
        'User "%s" updating board "%s".',
        user.username,
        board_id,
    )

    board = await boards_service.update_board(
        board_id,
        user.id,
        request,
    )

    return BoardResponse.model_validate(
        board
    )


@router.patch(
    "/{board_id}/status",
    response_model=BoardResponse,
    response_model_by_alias=True,
)
async def update_board_status(
    board_id: int,
    request: UpdateBoardStatusRequest,
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> BoardResponse:
    logger.info(
        (
            'User "%s" updating board '
            '"%s" status to "%s".'
        ),
        user.username,
        board_id,
        request.status,
    )

    board = (
        await boards_service.update_board_status(
            board_id,
            user.id,
            request.status,
        )
    )

    return BoardResponse.model_validate(
        board
    )


@router.get(
    "",
    response_model=list[BoardResponse],
    response_model_by_alias=True,
)
async def get_all_boards(
    user: CurrentUser,
    boards_service: BoardsServiceDependency,
) -> list[BoardResponse]:
    logger.info(
        'User "%s" getting all boards.',
        user.username,
    )

    boards = (
        await boards_service.get_all_boards(
            user.id,
        )
    )

    return [
        BoardResponse.model_validate(board)
        for board in boards
    ]