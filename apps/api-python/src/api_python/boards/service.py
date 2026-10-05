from fastapi import (
    HTTPException,
    status,
)
from sqlalchemy import (
    delete,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api_python.boards.schemas import (
    CreateBoardRequest,
    UpdateBoardRequest,
)
from api_python.models.board import Board
from api_python.models.enums import BoardStatus
from api_python.models.user import User


class BoardsService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self._session = session

    async def create_board(
        self,
        request: CreateBoardRequest,
        user: User,
    ) -> Board:
        board = Board(
            title=request.title,
            description=request.description,
            status=BoardStatus.PUBLIC,
            user_id=user.id,
        )

        self._session.add(board)

        await self._session.commit()
        await self._session.refresh(board)

        return board

    async def get_board_by_id(
        self,
        board_id: int,
        user_id: int,
    ) -> Board:
        result = await self._session.execute(
            select(Board).where(
                Board.id == board_id,
                Board.user_id == user_id,
            )
        )

        board = result.scalar_one_or_none()

        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Can't find Board with id "
                    f"{board_id}"
                ),
            )

        return board

    async def delete_board(
        self,
        board_id: int,
        user_id: int,
    ) -> None:
        result = await self._session.execute(
            delete(Board)
            .where(
                Board.id == board_id,
                Board.user_id == user_id,
            )
            .returning(Board.id)
        )

        deleted_id = (
            result.scalar_one_or_none()
        )

        if deleted_id is None:
            await self._session.rollback()

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "데이터를 찾을 수 없습니다."
                ),
            )

        await self._session.commit()

    async def update_board(
        self,
        board_id: int,
        user_id: int,
        request: UpdateBoardRequest,
    ) -> Board:
        result = await self._session.execute(
            update(Board)
            .where(
                Board.id == board_id,
                Board.user_id == user_id,
            )
            .values(
                title=request.title,
                description=request.description,
                status=request.status,
            )
            .returning(Board)
        )

        board = result.scalar_one_or_none()

        if board is None:
            await self._session.rollback()

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "데이터를 찾을 수 없습니다."
                ),
            )

        await self._session.commit()

        return board

    async def update_board_status(
        self,
        board_id: int,
        user_id: int,
        board_status: BoardStatus,
    ) -> Board:
        result = await self._session.execute(
            update(Board)
            .where(
                Board.id == board_id,
                Board.user_id == user_id,
            )
            .values(
                status=board_status,
            )
            .returning(Board)
        )

        board = result.scalar_one_or_none()

        if board is None:
            await self._session.rollback()

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "데이터를 찾을 수 없습니다."
                ),
            )

        await self._session.commit()

        return board

    async def get_all_boards(
        self,
        user_id: int,
    ) -> list[Board]:
        result = await self._session.execute(
            select(Board).where(
                Board.user_id == user_id
            )
        )

        return list(
            result.scalars().all()
        )