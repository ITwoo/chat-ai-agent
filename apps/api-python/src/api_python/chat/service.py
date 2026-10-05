from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api_python.models.chat import (
    ChatMessage,
    ChatMessageRagCitation,
    ChatRoom,
)
from api_python.models.enums import (
    ChatMessageRole,
    ChatMessageStatus,
)
from api_python.rag.schemas import RagCitation


RECENT_CONTEXT_MESSAGE_LIMIT = 20
SUMMARY_MESSAGE_BATCH_LIMIT = 40
DEFAULT_MESSAGE_PAGE_SIZE = 30


@dataclass(slots=True)
class ChatUser:
    id: int
    username: str


@dataclass(slots=True)
class ChatMessagesPageResult:
    messages: list[ChatMessage]
    next_cursor: int | None


@dataclass(slots=True)
class ChatAgentContext:
    summary: str | None
    messages: list[ChatMessage]


@dataclass(slots=True)
class ChatSummaryTarget:
    current_summary: str | None
    current_summary_through_message_id: int | None
    messages: list[ChatMessage]
    through_message_id: int


@dataclass(slots=True)
class SaveChatSummaryInput:
    summary: str
    expected_through_message_id: int | None
    through_message_id: int


@dataclass(slots=True)
class ChatGenerationResult:
    user_message: ChatMessage
    assistant_message: ChatMessage


class ChatService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self._session = session

    async def create_room(
        self,
        user: ChatUser,
        title: str | None = None,
    ) -> ChatRoom:
        room = ChatRoom(
            title=title.strip() if title and title.strip() else "새 채팅",
            user_id=user.id,
        )

        self._session.add(room)

        await self._session.commit()
        await self._session.refresh(room)

        return room

    async def get_rooms(
        self,
        user: ChatUser,
    ) -> list[ChatRoom]:
        result = await self._session.execute(
            select(ChatRoom)
            .where(
                ChatRoom.user_id == user.id
            )
            .order_by(
                ChatRoom.updated_at.desc()
            )
        )

        return list(result.scalars().all())

    async def get_messages(
        self,
        room_id: int,
        user: ChatUser,
        *,
        cursor: int | None = None,
        limit: int | None = None,
    ) -> ChatMessagesPageResult:
        await self.assert_room_owner(
            room_id,
            user.id,
        )

        page_size = (
            limit
            if limit is not None
            else DEFAULT_MESSAGE_PAGE_SIZE
        )

        query = (
            select(ChatMessage)
            .where(
                ChatMessage.room_id == room_id
            )
            .options(
                selectinload(
                    ChatMessage.rag_citations
                )
            )
            .order_by(
                ChatMessage.id.desc()
            )
            .limit(page_size + 1)
        )

        if cursor is not None:
            query = query.where(
                ChatMessage.id < cursor
            )

        result = await self._session.execute(query)

        messages = list(
            result.scalars().all()
        )

        for message in messages:
            message.rag_citations.sort(
                key=lambda citation: citation.similarity,
                reverse=True,
            )

        has_more = len(messages) > page_size

        page_messages = (
            messages[:page_size]
            if has_more
            else messages
        )

        next_cursor = (
            page_messages[-1].id
            if has_more and page_messages
            else None
        )

        page_messages.reverse()

        return ChatMessagesPageResult(
            messages=page_messages,
            next_cursor=next_cursor,
        )

    async def save_user_message(
        self,
        room_id: int,
        user: ChatUser,
        content: str,
    ) -> ChatMessage:
        await self.assert_room_owner(
            room_id,
            user.id,
        )

        normalized_content = (
            self._normalize_message_content(
                content
            )
        )

        return await self._create_message(
            room_id=room_id,
            role=ChatMessageRole.USER,
            content=normalized_content,
        )

    async def assert_room_owner(
        self,
        room_id: int,
        user_id: int,
    ) -> ChatRoom:
        result = await self._session.execute(
            select(ChatRoom).where(
                ChatRoom.id == room_id
            )
        )

        room = result.scalar_one_or_none()

        if room is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="채팅방을 찾을 수 없습니다.",
            )

        if room.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이 채팅방에 접근할 수 없습니다.",
            )

        return room

    async def save_assistant_message(
        self,
        room_id: int,
        user_id: int,
        assistant_content: str,
        rag_citations: Sequence[RagCitation] = (),
    ) -> ChatMessage:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        try:
            assistant_message = ChatMessage(
                room_id=room_id,
                role=ChatMessageRole.ASSISTANT,
                content=assistant_content,
            )

            self._session.add(
                assistant_message
            )

            await self._session.flush()

            for citation in rag_citations:
                self._session.add(
                    ChatMessageRagCitation(
                        chat_message_id=assistant_message.id,
                        document_id=citation.document_id,
                        chunk_id=citation.chunk_id,
                        chunk_index=citation.chunk_index,
                        page_number=citation.page_number,
                        file_name=citation.file_name,
                        similarity=citation.similarity,
                    )
                )

            await self._touch_room_updated_at(
                room_id,
                commit=False,
            )

            await self._session.commit()

        except Exception:
            await self._session.rollback()
            raise

        result = await self._session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.id
                == assistant_message.id
            )
            .options(
                selectinload(
                    ChatMessage.rag_citations
                )
            )
        )

        message = result.scalar_one()

        message.rag_citations.sort(
            key=lambda citation: citation.similarity,
            reverse=True,
        )

        return message

    async def get_context_messages(
        self,
        room_id: int,
        user_id: int,
    ) -> ChatAgentContext:
        room = await self.assert_room_owner(
            room_id,
            user_id,
        )

        summary = (
            room.summary.strip()
            if room.summary
            and room.summary.strip()
            else None
        )

        summary_through_message_id = (
            room.summary_through_message_id
            if summary is not None
            else None
        )

        query = (
            select(ChatMessage)
            .where(
                ChatMessage.room_id == room_id,
                ChatMessage.status
                == ChatMessageStatus.COMPLETED,
            )
            .order_by(
                ChatMessage.id.desc()
            )
        )

        if summary_through_message_id is not None:
            query = query.where(
                ChatMessage.id
                > summary_through_message_id
            )
        else:
            query = query.limit(
                RECENT_CONTEXT_MESSAGE_LIMIT
            )

        result = await self._session.execute(
            query
        )

        messages = list(
            result.scalars().all()
        )

        messages.reverse()

        return ChatAgentContext(
            summary=summary,
            messages=messages,
        )

    async def get_recent_messages(
        self,
        room_id: int,
        user_id: int,
    ) -> list[ChatMessage]:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        result = await self._session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.room_id == room_id,
                ChatMessage.status
                == ChatMessageStatus.COMPLETED,
            )
            .order_by(
                ChatMessage.created_at.desc()
            )
            .limit(
                RECENT_CONTEXT_MESSAGE_LIMIT
            )
        )

        messages = list(
            result.scalars().all()
        )

        messages.reverse()

        return messages

    async def get_summary_target(
        self,
        room_id: int,
        user_id: int,
    ) -> ChatSummaryTarget | None:
        room = await self.assert_room_owner(
            room_id,
            user_id,
        )

        filters = [
            ChatMessage.room_id == room_id,
            ChatMessage.status
            == ChatMessageStatus.COMPLETED,
        ]

        if (
            room.summary_through_message_id
            is not None
        ):
            filters.append(
                ChatMessage.id
                > room.summary_through_message_id
            )

        count_result = (
            await self._session.execute(
                select(
                    func.count(ChatMessage.id)
                ).where(*filters)
            )
        )

        unsummarized_message_count = (
            count_result.scalar_one()
        )

        summarizable_message_count = (
            unsummarized_message_count
            - RECENT_CONTEXT_MESSAGE_LIMIT
        )

        if summarizable_message_count <= 0:
            return None

        result = await self._session.execute(
            select(ChatMessage)
            .where(*filters)
            .order_by(
                ChatMessage.id.asc()
            )
            .limit(
                min(
                    summarizable_message_count,
                    SUMMARY_MESSAGE_BATCH_LIMIT,
                )
            )
        )

        messages = list(
            result.scalars().all()
        )

        if (
            messages
            and messages[-1].role
            == ChatMessageRole.USER
        ):
            messages.pop()

        if not messages:
            return None

        through_message_id = messages[-1].id

        return ChatSummaryTarget(
            current_summary=room.summary,
            current_summary_through_message_id=(
                room.summary_through_message_id
            ),
            messages=messages,
            through_message_id=through_message_id,
        )

    async def save_summary(
        self,
        room_id: int,
        user_id: int,
        input_data: SaveChatSummaryInput,
    ) -> str:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        result = await self._session.execute(
            update(ChatRoom)
            .where(
                ChatRoom.id == room_id,
                ChatRoom.user_id == user_id,
                ChatRoom.summary_through_message_id
                == input_data.expected_through_message_id,
            )
            .values(
                summary=input_data.summary,
                summary_through_message_id=(
                    input_data.through_message_id
                ),
                summary_updated_at=datetime.now(),
            )
        )

        await self._session.commit()

        return (
            "SAVED"
            if result.rowcount == 1
            else "STALE"
        )

    async def update_room_title_from_first_message(
        self,
        room_id: int,
        user_id: int,
        content: str,
    ) -> ChatRoom:
        room = await self.assert_room_owner(
            room_id,
            user_id,
        )

        if room.title != "새 채팅":
            return room

        title = self._create_room_title(
            content
        )

        room.title = title
        room.updated_at = datetime.now()

        await self._session.commit()
        await self._session.refresh(room)

        return room

    async def delete_room(
        self,
        room_id: int,
        user_id: int,
    ) -> None:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        await self._session.execute(
            delete(ChatRoom).where(
                ChatRoom.id == room_id
            )
        )

        await self._session.commit()

    async def update_room_title(
        self,
        room_id: int,
        user_id: int,
        title: str,
    ) -> ChatRoom:
        room = await self.assert_room_owner(
            room_id,
            user_id,
        )

        room.title = (
            self._normalize_room_title(
                title
            )
        )

        room.updated_at = datetime.now()

        await self._session.commit()
        await self._session.refresh(room)

        return room

    async def cancel_generation(
        self,
        room_id: int,
        user_id: int,
        user_message_id: int,
    ) -> ChatGenerationResult:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        try:
            user_message = (
                await self._update_message_status(
                    user_message_id,
                    ChatMessageStatus.CANCELLED,
                    commit=False,
                )
            )

            assistant_message = (
                await self._create_message(
                    room_id=room_id,
                    role=(
                        ChatMessageRole.ASSISTANT
                    ),
                    content=(
                        "[응답이 중단되었습니다.]"
                    ),
                    status_value=(
                        ChatMessageStatus.CANCELLED
                    ),
                    commit=False,
                )
            )

            await self._touch_room_updated_at(
                room_id,
                commit=False,
            )

            await self._session.commit()

        except Exception:
            await self._session.rollback()
            raise

        return ChatGenerationResult(
            user_message=user_message,
            assistant_message=assistant_message,
        )

    async def fail_generation(
        self,
        room_id: int,
        user_id: int,
        user_message_id: int,
    ) -> ChatGenerationResult:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        try:
            user_message = (
                await self._update_message_status(
                    user_message_id,
                    ChatMessageStatus.FAILED,
                    commit=False,
                )
            )

            assistant_message = (
                await self._create_message(
                    room_id=room_id,
                    role=(
                        ChatMessageRole.ASSISTANT
                    ),
                    content=(
                        "[응답 생성에 실패했습니다.]"
                    ),
                    status_value=(
                        ChatMessageStatus.FAILED
                    ),
                    commit=False,
                )
            )

            await self._touch_room_updated_at(
                room_id,
                commit=False,
            )

            await self._session.commit()

        except Exception:
            await self._session.rollback()
            raise

        return ChatGenerationResult(
            user_message=user_message,
            assistant_message=assistant_message,
        )

    async def get_retryable_user_message(
        self,
        room_id: int,
        user_id: int,
        user_message_id: int,
    ) -> ChatMessage:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        result = await self._session.execute(
            select(ChatMessage).where(
                ChatMessage.id
                == user_message_id,
                ChatMessage.room_id
                == room_id,
                ChatMessage.role
                == ChatMessageRole.USER,
            )
        )

        message = (
            result.scalar_one_or_none()
        )

        if message is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "재시도할 사용자 메시지를 "
                    "찾을 수 없습니다."
                ),
            )

        if (
            message.status
            != ChatMessageStatus.FAILED
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "실패한 메시지만 "
                    "재시도할 수 있습니다."
                ),
            )

        return message

    async def complete_user_message_if_failed(
        self,
        room_id: int,
        user_id: int,
        user_message_id: int,
    ) -> ChatMessage | None:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        result = await self._session.execute(
            update(ChatMessage)
            .where(
                ChatMessage.id
                == user_message_id,
                ChatMessage.room_id
                == room_id,
                ChatMessage.role
                == ChatMessageRole.USER,
                ChatMessage.status
                == ChatMessageStatus.FAILED,
            )
            .values(
                status=(
                    ChatMessageStatus.COMPLETED
                )
            )
        )

        if result.rowcount == 0:
            await self._session.rollback()
            return None

        await self._session.commit()

        result = await self._session.execute(
            select(ChatMessage).where(
                ChatMessage.id
                == user_message_id
            )
        )

        return result.scalar_one()

    async def save_retried_assistant_message(
        self,
        room_id: int,
        user_id: int,
        user_message_id: int,
        assistant_content: str,
        rag_citations: Sequence[
            RagCitation
        ] = (),
    ) -> tuple[
        ChatMessage,
        ChatMessage,
    ]:
        await self.assert_room_owner(
            room_id,
            user_id,
        )

        try:
            result = (
                await self._session.execute(
                    update(ChatMessage)
                    .where(
                        ChatMessage.id
                        == user_message_id,
                        ChatMessage.room_id
                        == room_id,
                        ChatMessage.role
                        == ChatMessageRole.USER,
                        ChatMessage.status
                        == ChatMessageStatus.FAILED,
                    )
                    .values(
                        status=(
                            ChatMessageStatus.COMPLETED
                        )
                    )
                )
            )

            if result.rowcount != 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "재시도할 수 없는 메시지입니다."
                    ),
                )

            result = (
                await self._session.execute(
                    select(ChatMessage).where(
                        ChatMessage.id
                        == user_message_id
                    )
                )
            )

            user_message = (
                result.scalar_one()
            )

            assistant_message = ChatMessage(
                room_id=room_id,
                role=ChatMessageRole.ASSISTANT,
                content=assistant_content,
            )

            self._session.add(
                assistant_message
            )

            await self._session.flush()

            for citation in rag_citations:
                self._session.add(
                    ChatMessageRagCitation(
                        chat_message_id=(
                            assistant_message.id
                        ),
                        document_id=(
                            citation.document_id
                        ),
                        chunk_id=(
                            citation.chunk_id
                        ),
                        chunk_index=(
                            citation.chunk_index
                        ),
                        page_number=(
                            citation.page_number
                        ),
                        file_name=(
                            citation.file_name
                        ),
                        similarity=(
                            citation.similarity
                        ),
                    )
                )

            await self._touch_room_updated_at(
                room_id,
                commit=False,
            )

            await self._session.commit()

        except Exception:
            await self._session.rollback()
            raise

        result = await self._session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.id
                == assistant_message.id
            )
            .options(
                selectinload(
                    ChatMessage.rag_citations
                )
            )
        )

        assistant_message = (
            result.scalar_one()
        )

        assistant_message.rag_citations.sort(
            key=lambda citation: citation.similarity,
            reverse=True,
        )

        return (
            user_message,
            assistant_message,
        )

    def _create_room_title(
        self,
        content: str,
    ) -> str:
        normalized = " ".join(
            content.split()
        )

        if not normalized:
            return "새 채팅"

        if len(normalized) <= 30:
            return normalized

        return (
            f"{normalized[:30]}..."
        )

    async def _create_message(
        self,
        *,
        room_id: int,
        role: ChatMessageRole,
        content: str,
        status_value: ChatMessageStatus = (
            ChatMessageStatus.COMPLETED
        ),
        commit: bool = True,
    ) -> ChatMessage:
        message = ChatMessage(
            room_id=room_id,
            role=role,
            content=content,
            status=status_value,
        )

        self._session.add(message)

        await self._session.flush()

        await self._touch_room_updated_at(
            room_id,
            commit=False,
        )

        if commit:
            await self._session.commit()
            await self._session.refresh(
                message
            )

        return message

    async def _update_message_status(
        self,
        message_id: int,
        status_value: ChatMessageStatus,
        *,
        commit: bool = True,
    ) -> ChatMessage:
        result = await self._session.execute(
            select(ChatMessage).where(
                ChatMessage.id
                == message_id
            )
        )

        message = (
            result.scalar_one_or_none()
        )

        if message is None:
            raise HTTPException(
                status_code=404,
                detail="데이터를 찾을 수 없습니다.",
            )

        message.status = status_value

        if commit:
            await self._session.commit()
            await self._session.refresh(
                message
            )

        return message

    async def _touch_room_updated_at(
        self,
        room_id: int,
        *,
        commit: bool = True,
    ) -> ChatRoom:
        result = await self._session.execute(
            select(ChatRoom).where(
                ChatRoom.id == room_id
            )
        )

        room = (
            result.scalar_one_or_none()
        )

        if room is None:
            raise HTTPException(
                status_code=404,
                detail="데이터를 찾을 수 없습니다.",
            )

        room.updated_at = datetime.now()

        if commit:
            await self._session.commit()
            await self._session.refresh(
                room
            )

        return room

    @staticmethod
    def _normalize_message_content(
        content: str,
    ) -> str:
        normalized = content.strip()

        if not normalized:
            raise HTTPException(
                status_code=400,
                detail="메시지를 입력해주세요.",
            )

        return normalized

    @staticmethod
    def _normalize_room_title(
        title: str,
    ) -> str:
        normalized = " ".join(
            title.split()
        )

        if not normalized:
            raise HTTPException(
                status_code=400,
                detail="채팅방 제목을 입력해주세요.",
            )

        return normalized