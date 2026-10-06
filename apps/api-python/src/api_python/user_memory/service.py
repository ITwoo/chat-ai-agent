import logging
import re
from datetime import (
    datetime,
    timezone,
)

from fastapi import (
    HTTPException,
    status,
)
from sqlalchemy import (
    select,
    text,
    update,
)
from sqlalchemy.dialects.postgresql import (
    insert,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from api_python.config import settings
from api_python.models.chat import (
    ChatMessage,
    ChatRoom,
)
from api_python.models.enums import (
    ChatMessageRole,
    UserMemoryStatus,
    UserMemoryType,
)
from api_python.models.user_memory import (
    UserMemory,
)
from api_python.rag.embedding import (
    RagEmbeddingService,
)
from api_python.rag.utils.vector import (
    serialize_vector,
)
from api_python.user_memory.types import (
    RelevantUserMemory,
    SearchUserMemoriesInput,
    UpsertExtractedUserMemoryInput,
    UpsertUserMemoryInput,
    UserMemoryEmbeddingBackfillBatchResult,
    UserMemorySearchResult,
    UserMemoryWriteResult,
)


DEFAULT_MEMORY_LIMIT = 50
MAX_MEMORY_LIMIT = 100

MAX_MEMORY_KEY_LENGTH = 120

MEMORY_KEY_PATTERN = re.compile(
    r"^[a-z0-9]+"
    r"(?:[._-][a-z0-9]+)*$"
)

DEFAULT_MEMORY_SEARCH_LIMIT = 10
MAX_MEMORY_SEARCH_LIMIT = 20

DEFAULT_RELEVANT_MEMORY_LIMIT = 8
MAX_RELEVANT_MEMORY_LIMIT = 20

RELEVANT_MEMORY_CANDIDATE_MULTIPLIER = 3

USER_MEMORY_MIN_SIMILARITY = 0.40

DEFAULT_EMBEDDING_BACKFILL_LIMIT = 25
MAX_EMBEDDING_BACKFILL_LIMIT = 100


logger = logging.getLogger(
    "UserMemoryService"
)


def utc_now() -> datetime:
    return datetime.now(
        timezone.utc
    )


class UserMemoryService:
    def __init__(
        self,
        session: AsyncSession,
        embedding_service: RagEmbeddingService,
    ) -> None:
        self._session = session

        self._embedding_service = (
            embedding_service
        )

    def _normalize_memory_key(
        self,
        memory_key: str,
    ) -> str:
        normalized = (
            memory_key
            .strip()
            .lower()
        )

        if not normalized:
            raise HTTPException(
                status_code=(
                    status.HTTP_400_BAD_REQUEST
                ),
                detail=(
                    "메모리 키를 입력해주세요."
                ),
            )

        if (
            len(normalized)
            > MAX_MEMORY_KEY_LENGTH
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_400_BAD_REQUEST
                ),
                detail=(
                    "메모리 키는 "
                    f"{MAX_MEMORY_KEY_LENGTH}"
                    "자를 초과할 수 없습니다."
                ),
            )

        if not MEMORY_KEY_PATTERN.fullmatch(
            normalized
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_400_BAD_REQUEST
                ),
                detail=(
                    "메모리 키는 영문 소문자와 "
                    "숫자, 점, 밑줄, 하이픈만 "
                    "사용할 수 있습니다."
                ),
            )

        return normalized

    @staticmethod
    def _normalize_content(
        content: str,
    ) -> str:
        normalized = content.strip()

        if not normalized:
            raise HTTPException(
                status_code=(
                    status.HTTP_400_BAD_REQUEST
                ),
                detail=(
                    "메모리 내용을 입력해주세요."
                ),
            )

        return normalized

    @staticmethod
    def _create_embedding_text(
        memory_type: UserMemoryType,
        memory_key: str,
        content: str,
    ) -> str:
        return (
            f"[{memory_type.value}] "
            f"{memory_key}\n"
            f"{content}"
        )

    async def _create_embedding(
        self,
        memory_type: UserMemoryType,
        memory_key: str,
        content: str,
    ) -> list[float]:
        result = (
            await self._embedding_service
            .embed_text(
                self._create_embedding_text(
                    memory_type,
                    memory_key,
                    content,
                )
            )
        )

        return result.embedding

    @staticmethod
    def _normalize_limit(
        limit: int,
    ) -> int:
        if limit < 1:
            return DEFAULT_MEMORY_LIMIT

        return min(
            limit,
            MAX_MEMORY_LIMIT,
        )

    @staticmethod
    def _normalize_search_limit(
        limit: int | None,
    ) -> int:
        if (
            limit is None
            or limit < 1
        ):
            return (
                DEFAULT_MEMORY_SEARCH_LIMIT
            )

        return min(
            limit,
            MAX_MEMORY_SEARCH_LIMIT,
        )

    @staticmethod
    def _normalize_relevant_limit(
        limit: int,
    ) -> int:
        if limit < 1:
            return (
                DEFAULT_RELEVANT_MEMORY_LIMIT
            )

        return min(
            limit,
            MAX_RELEVANT_MEMORY_LIMIT,
        )

    @staticmethod
    def _normalize_backfill_limit(
        limit: int,
    ) -> int:
        if limit < 1:
            return (
                DEFAULT_EMBEDDING_BACKFILL_LIMIT
            )

        return min(
            limit,
            MAX_EMBEDDING_BACKFILL_LIMIT,
        )

    async def _assert_source_message_owner(
        self,
        user_id: int,
        source_message_id: int | None,
    ) -> None:
        if source_message_id is None:
            return

        result = await self._session.execute(
            select(
                ChatMessage.id
            )
            .join(
                ChatRoom,
                ChatRoom.id
                == ChatMessage.room_id,
            )
            .where(
                ChatMessage.id
                == source_message_id,
                ChatRoom.user_id
                == user_id,
            )
        )

        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=(
                    status.HTTP_400_BAD_REQUEST
                ),
                detail=(
                    "메모리 출처 메시지를 "
                    "찾을 수 없거나 접근할 수 없습니다."
                ),
            )

    async def get_active_memories(
        self,
        user_id: int,
        limit: int = DEFAULT_MEMORY_LIMIT,
    ) -> list[UserMemory]:
        result = await self._session.execute(
            select(
                UserMemory
            )
            .where(
                UserMemory.user_id
                == user_id,
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
            )
            .order_by(
                UserMemory
                .last_confirmed_at
                .desc()
            )
            .limit(
                self._normalize_limit(
                    limit
                )
            )
        )

        return list(
            result.scalars().all()
        )

    async def search_memories_for_tool(
        self,
        user_id: int,
        input_data: (
            SearchUserMemoriesInput
        ),
    ) -> list[
        UserMemorySearchResult
    ]:
        query = (
            input_data.query.strip()
            if input_data.query
            else ""
        )

        limit = (
            self._normalize_search_limit(
                input_data.limit
            )
        )

        if query:
            return list(
                await self.search_relevant_memories(
                    user_id,
                    query,
                    limit,
                    input_data.type,
                )
            )

        statement = (
            select(
                UserMemory
            )
            .where(
                UserMemory.user_id
                == user_id,
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
            )
            .order_by(
                UserMemory.updated_at.desc()
            )
            .limit(limit)
        )

        if input_data.type is not None:
            statement = statement.where(
                UserMemory.type
                == input_data.type
            )

        result = (
            await self._session.execute(
                statement
            )
        )

        return [
            UserMemorySearchResult(
                id=memory.id,
                type=memory.type,
                memory_key=(
                    memory.memory_key
                ),
                content=memory.content,
                updated_at=(
                    memory.updated_at
                ),
                similarity=None,
            )
            for memory
            in result.scalars().all()
        ]

    async def search_relevant_memories(
        self,
        user_id: int,
        query: str,
        limit: int = (
            DEFAULT_RELEVANT_MEMORY_LIMIT
        ),
        memory_type: (
            UserMemoryType | None
        ) = None,
    ) -> list[
        RelevantUserMemory
    ]:
        normalized_query = query.strip()

        if not normalized_query:
            return []

        search_limit = (
            self._normalize_relevant_limit(
                limit
            )
        )

        candidate_limit = (
            search_limit
            * RELEVANT_MEMORY_CANDIDATE_MULTIPLIER
        )

        embedding_result = (
            await self._embedding_service
            .embed_text(
                normalized_query
            )
        )

        vector = serialize_vector(
            embedding_result.embedding
        )

        async with self._session.begin():
            await self._session.execute(
                text(
                    "SET LOCAL "
                    "hnsw.iterative_scan = "
                    "'strict_order'"
                )
            )

            result = (
                await self._session.execute(
                    text(
                        """
                        SELECT
                            memory."id",
                            memory."type",
                            memory."memoryKey",
                            memory."content",
                            memory."updatedAt",
                            (
                                1 - (
                                    memory."embedding"
                                    <=> CAST(
                                        :vector AS vector
                                    )
                                )
                            )::double precision
                                AS "similarity"
                        FROM "UserMemory"
                            AS memory
                        WHERE
                            memory."userId"
                                = :user_id
                            AND memory."status"
                                = 'ACTIVE'
                            AND memory."embedding"
                                IS NOT NULL
                            AND (
                                :memory_type
                                    IS NULL
                                OR memory."type"::text
                                    = :memory_type
                            )
                        ORDER BY
                            memory."embedding"
                            <=> CAST(
                                :vector AS vector
                            )
                        LIMIT :candidate_limit
                        """
                    ),
                    {
                        "vector": vector,
                        "user_id": user_id,
                        "memory_type": (
                            memory_type.value
                            if memory_type
                            else None
                        ),
                        "candidate_limit": (
                            candidate_limit
                        ),
                    },
                )
            )

            rows = (
                result.mappings().all()
            )

        if (
            settings.node_env
            != "production"
        ):
            logger.info(
                "[memory-search] "
                "userId=%s, query=%r, "
                "type=%s, candidates=%s",
                user_id,
                normalized_query,
                (
                    memory_type.value
                    if memory_type
                    else "ALL"
                ),
                [
                    {
                        "id": row["id"],
                        "type": row["type"],
                        "memoryKey": (
                            row["memoryKey"]
                        ),
                        "similarity": (
                            row["similarity"]
                        ),
                    }
                    for row in rows
                ],
            )

        memories = [
            RelevantUserMemory(
                id=row["id"],
                type=UserMemoryType(
                    row["type"]
                ),
                memory_key=(
                    row["memoryKey"]
                ),
                content=row["content"],
                updated_at=(
                    row["updatedAt"]
                ),
                similarity=float(
                    row["similarity"]
                ),
            )
            for row in rows
            if float(
                row["similarity"]
            )
            >= USER_MEMORY_MIN_SIMILARITY
        ]

        return memories[
            :search_limit
        ]

    async def backfill_missing_embeddings(
        self,
        after_id: int = 0,
        limit: int = (
            DEFAULT_EMBEDDING_BACKFILL_LIMIT
        ),
    ) -> (
        UserMemoryEmbeddingBackfillBatchResult
    ):
        take = (
            self._normalize_backfill_limit(
                limit
            )
        )

        result = await self._session.execute(
            select(
                UserMemory
            )
            .where(
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
                UserMemory.embedding
                .is_(None),
                UserMemory.id
                > after_id,
            )
            .order_by(
                UserMemory.id.asc()
            )
            .limit(take)
        )

        memories = list(
            result.scalars().all()
        )

        updated_count = 0
        failed_ids: list[int] = []

        for memory in memories:
            try:
                embedding = (
                    await self._create_embedding(
                        memory.type,
                        memory.memory_key,
                        memory.content,
                    )
                )

                result = (
                    await self._session.execute(
                        update(
                            UserMemory
                        )
                        .where(
                            UserMemory.id
                            == memory.id,
                            UserMemory.status
                            == UserMemoryStatus.ACTIVE,
                            UserMemory.embedding
                            .is_(None),
                        )
                        .values(
                            embedding=embedding
                        )
                    )
                )

                updated_count += (
                    result.rowcount or 0
                )

                await self._session.commit()

            except Exception:
                await self._session.rollback()

                failed_ids.append(
                    memory.id
                )

        return (
            UserMemoryEmbeddingBackfillBatchResult(
                selected_count=len(
                    memories
                ),
                updated_count=(
                    updated_count
                ),
                failed_memory_ids=(
                    failed_ids
                ),
                next_cursor=(
                    memories[-1].id
                    if memories
                    else None
                ),
            )
        )

    async def get_active_memory_by_id(
        self,
        user_id: int,
        memory_id: int,
    ) -> UserMemory:
        result = await self._session.execute(
            select(
                UserMemory
            ).where(
                UserMemory.id
                == memory_id,
                UserMemory.user_id
                == user_id,
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
            )
        )

        memory = (
            result.scalar_one_or_none()
        )

        if memory is None:
            raise HTTPException(
                status_code=(
                    status.HTTP_404_NOT_FOUND
                ),
                detail=(
                    "활성 사용자 메모리를 "
                    "찾을 수 없습니다."
                ),
            )

        return memory

    async def upsert_memory(
        self,
        user_id: int,
        input_data: UpsertUserMemoryInput,
    ) -> UserMemory:
        memory_key = (
            self._normalize_memory_key(
                input_data.memory_key
            )
        )

        content = (
            self._normalize_content(
                input_data.content
            )
        )

        await self._assert_source_message_owner(
            user_id,
            input_data.source_message_id,
        )

        embedding = (
            await self._create_embedding(
                input_data.type,
                memory_key,
                content,
            )
        )

        now = utc_now()

        statement = (
            insert(
                UserMemory
            )
            .values(
                user_id=user_id,
                type=input_data.type,
                memory_key=memory_key,
                content=content,
                embedding=embedding,
                status=(
                    UserMemoryStatus.ACTIVE
                ),
                source_message_id=(
                    input_data
                    .source_message_id
                ),
                last_confirmed_at=now,
                deleted_at=None,
            )
            .on_conflict_do_update(
                index_elements=[
                    "userId",
                    "memoryKey",
                ],
                set_={
                    "type": (
                        input_data.type
                    ),
                    "content": content,
                    "embedding": (
                        embedding
                    ),
                    "status": (
                        UserMemoryStatus.ACTIVE
                    ),
                    "sourceMessageId": (
                        input_data
                        .source_message_id
                    ),
                    "lastConfirmedAt": now,
                    "updatedAt": now,
                    "deletedAt": None,
                },
            )
            .returning(
                UserMemory
            )
        )

        result = await self._session.execute(
            statement
        )

        await self._session.commit()

        return result.scalar_one()

    async def upsert_extracted_memory(
        self,
        user_id: int,
        input_data: (
            UpsertExtractedUserMemoryInput
        ),
    ) -> UserMemoryWriteResult:
        memory_key = (
            self._normalize_memory_key(
                input_data.memory_key
            )
        )

        content = (
            self._normalize_content(
                input_data.content
            )
        )

        await self._assert_source_message_owner(
            user_id,
            input_data.source_message_id,
        )

        embedding = (
            await self._create_embedding(
                input_data.type,
                memory_key,
                content,
            )
        )

        now = utc_now()

        result = await self._session.execute(
            text(
                """
                INSERT INTO "UserMemory" (
                    "userId",
                    "type",
                    "memoryKey",
                    "content",
                    "status",
                    "sourceMessageId",
                    "lastConfirmedAt",
                    "createdAt",
                    "updatedAt",
                    "deletedAt",
                    "embedding"
                )
                VALUES (
                    :user_id,
                    CAST(
                        :memory_type
                        AS "UserMemoryType"
                    ),
                    :memory_key,
                    :content,
                    'ACTIVE',
                    :source_message_id,
                    :now,
                    :now,
                    :now,
                    NULL,
                    CAST(
                        :vector
                        AS vector
                    )
                )
                ON CONFLICT (
                    "userId",
                    "memoryKey"
                )
                DO UPDATE SET
                    "type"
                        = EXCLUDED."type",
                    "content"
                        = EXCLUDED."content",
                    "status"
                        = EXCLUDED."status",
                    "sourceMessageId"
                        = EXCLUDED."sourceMessageId",
                    "lastConfirmedAt"
                        = EXCLUDED."lastConfirmedAt",
                    "updatedAt"
                        = EXCLUDED."updatedAt",
                    "deletedAt"
                        = NULL,
                    "embedding"
                        = EXCLUDED."embedding"
                WHERE (
                    "UserMemory"."status"
                        <> 'DELETED'
                    AND (
                        "UserMemory"."sourceMessageId"
                            IS NULL
                        OR
                        "UserMemory"."sourceMessageId"
                            < EXCLUDED."sourceMessageId"
                    )
                )
                OR (
                    "UserMemory"."status"
                        = 'DELETED'
                    AND
                    "UserMemory"."deletedAt"
                        IS NOT NULL
                    AND (
                        SELECT message."createdAt"
                        FROM "ChatMessage"
                            AS message
                        WHERE
                            message."id"
                            = EXCLUDED."sourceMessageId"
                    )
                    > "UserMemory"."deletedAt"
                )
                RETURNING "id"
                """
            ),
            {
                "user_id": user_id,
                "memory_type": (
                    input_data.type.value
                ),
                "memory_key": memory_key,
                "content": content,
                "source_message_id": (
                    input_data
                    .source_message_id
                ),
                "now": now,
                "vector": (
                    serialize_vector(
                        embedding
                    )
                ),
            },
        )

        row = result.first()

        await self._session.commit()

        return (
            "APPLIED"
            if row is not None
            else "STALE"
        )

    async def archive_active_memory_by_key(
        self,
        user_id: int,
        memory_key: str,
        source_message_id: int,
    ) -> UserMemoryWriteResult:
        normalized_key = (
            self._normalize_memory_key(
                memory_key
            )
        )

        await self._assert_source_message_owner(
            user_id,
            source_message_id,
        )

        result = await self._session.execute(
            update(
                UserMemory
            )
            .where(
                UserMemory.user_id
                == user_id,
                UserMemory.memory_key
                == normalized_key,
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
                (
                    UserMemory.source_message_id
                    .is_(None)
                    |
                    (
                        UserMemory
                        .source_message_id
                        < source_message_id
                    )
                ),
            )
            .values(
                status=(
                    UserMemoryStatus.ARCHIVED
                ),
                source_message_id=(
                    source_message_id
                ),
                last_confirmed_at=(
                    utc_now()
                ),
            )
        )

        await self._session.commit()

        return (
            "APPLIED"
            if result.rowcount == 1
            else "STALE"
        )

    async def archive_memory(
        self,
        user_id: int,
        memory_id: int,
    ) -> None:
        result = await self._session.execute(
            update(
                UserMemory
            )
            .where(
                UserMemory.id
                == memory_id,
                UserMemory.user_id
                == user_id,
            )
            .values(
                status=(
                    UserMemoryStatus.ARCHIVED
                )
            )
        )

        await self._session.commit()

        if result.rowcount != 1:
            raise HTTPException(
                status_code=(
                    status.HTTP_404_NOT_FOUND
                ),
                detail=(
                    "사용자 메모리를 "
                    "찾을 수 없습니다."
                ),
            )

    async def delete_active_memory(
        self,
        user_id: int,
        memory_id: int,
    ) -> None:
        deleted_at = utc_now()

        result = await self._session.execute(
            update(
                UserMemory
            )
            .where(
                UserMemory.id
                == memory_id,
                UserMemory.user_id
                == user_id,
                UserMemory.status
                == UserMemoryStatus.ACTIVE,
            )
            .values(
                content="",
                status=(
                    UserMemoryStatus.DELETED
                ),
                source_message_id=None,
                last_confirmed_at=(
                    deleted_at
                ),
                updated_at=deleted_at,
                deleted_at=deleted_at,
                embedding=None,
            )
        )

        await self._session.commit()

        if result.rowcount == 1:
            return

        check = await self._session.execute(
            select(
                UserMemory.status
            ).where(
                UserMemory.id
                == memory_id,
                UserMemory.user_id
                == user_id,
            )
        )

        memory_status = (
            check.scalar_one_or_none()
        )

        if (
            memory_status
            == UserMemoryStatus.DELETED
        ):
            return

        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                "삭제할 활성 사용자 메모리를 "
                "찾을 수 없습니다."
            ),
        )