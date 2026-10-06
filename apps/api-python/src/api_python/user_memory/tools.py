import json
import logging
from typing import Any

from langchain_core.tools import (
    BaseTool,
    tool,
)
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from api_python.models.enums import (
    UserMemoryType,
)
from api_python.user_memory.service import (
    UserMemoryService,
)
from api_python.user_memory.types import (
    SearchUserMemoriesInput,
)


logger = logging.getLogger(
    "UserMemoryToolsService"
)


class SearchUserMemoriesArgs(
    BaseModel
):
    query: str | None = Field(
        default=None,
        min_length=1,
    )

    type: UserMemoryType | None = None

    limit: int | None = Field(
        default=None,
        ge=1,
        le=20,
    )


class DeleteUserMemoryArgs(
    BaseModel
):
    memory_id: int = Field(
        alias="memoryId",
        gt=0,
    )


class UserMemoryToolsService:
    def __init__(
        self,
        service: UserMemoryService,
    ) -> None:
        self._service = service

    def get_tools(
        self,
        user_id: int,
    ) -> list[BaseTool]:
        @tool(
            "search_user_memories",
            args_schema=(
                SearchUserMemoriesArgs
            ),
        )
        async def search_user_memories(
            query: str | None = None,
            type: UserMemoryType | None = None,
            limit: int | None = None,
        ) -> str:
            """저장된 장기 메모리를 조회한다. query가 있으면 의미가 관련된 메모리를 검색하고, query가 없으면 최근 활성 메모리를 조회한다."""

            memories = (
                await self._service
                .search_memories_for_tool(
                    user_id,
                    SearchUserMemoriesInput(
                        query=query,
                        type=type,
                        limit=limit,
                    ),
                )
            )

            return json.dumps(
                {
                    "count": len(
                        memories
                    ),
                    "memories": [
                        {
                            "id": memory.id,
                            "type": (
                                memory.type.value
                            ),
                            "memoryKey": (
                                memory.memory_key
                            ),
                            "content": (
                                memory.content
                            ),
                            "updatedAt": (
                                memory.updated_at
                                .isoformat()
                            ),
                        }
                        for memory
                        in memories
                    ],
                },
                ensure_ascii=False,
            )

        @tool(
            "delete_user_memory",
            args_schema=(
                DeleteUserMemoryArgs
            ),
        )
        async def delete_user_memory(
            memory_id: int,
        ) -> str:
            """사용자가 장기 메모리를 삭제해달라고 명확히 요청하고 정확한 memoryId를 확인한 경우에만 호출한다. 삭제 전 승인을 요청한다."""

            memory = (
                await self._service
                .get_active_memory_by_id(
                    user_id,
                    memory_id,
                )
            )

            approval_request = {
                "type": (
                    "user_memory_delete_approval"
                ),
                "action": (
                    "delete_user_memory"
                ),
                "message": (
                    "이 장기 메모리를 삭제할까요?"
                ),
                "memory": {
                    "id": memory.id,
                    "type": (
                        memory.type.value
                    ),
                    "memoryKey": (
                        memory.memory_key
                    ),
                    "content": (
                        memory.content
                    ),
                },
            }

            decision: Any = interrupt(
                approval_request
            )

            if not isinstance(
                decision,
                dict,
            ):
                return (
                    "메모리 삭제 승인 응답 "
                    "형식이 올바르지 않습니다."
                )

            action = decision.get(
                "action"
            )

            if action == "cancel":
                return json.dumps(
                    {
                        "deleted": False,
                        "status": (
                            "cancelled"
                        ),
                        "memoryId": (
                            memory_id
                        ),
                        "message": (
                            "장기 메모리 삭제를 "
                            "취소했습니다."
                        ),
                    },
                    ensure_ascii=False,
                )

            if action == "revise":
                content = str(
                    decision.get(
                        "content",
                        "",
                    )
                ).strip()

                if not content:
                    return (
                        "메모리 삭제 승인 응답 "
                        "형식이 올바르지 않습니다."
                    )

                return json.dumps(
                    {
                        "deleted": False,
                        "status": (
                            "revision_requested"
                        ),
                        "memory": (
                            approval_request[
                                "memory"
                            ]
                        ),
                        "revisionRequest": (
                            content
                        ),
                        "nextAction": (
                            "사용자의 revisionRequest를 "
                            "기준으로 "
                            "search_user_memories를 "
                            "다시 호출해 정확한 "
                            "메모리를 찾은 뒤 "
                            "delete_user_memory를 "
                            "다시 호출한다."
                        ),
                    },
                    ensure_ascii=False,
                )

            if action != "approve":
                return (
                    "메모리 삭제 승인 응답 "
                    "형식이 올바르지 않습니다."
                )

            await self._service.delete_active_memory(
                user_id,
                memory_id,
            )

            return json.dumps(
                {
                    "deleted": True,
                    "memory": (
                        approval_request[
                            "memory"
                        ]
                    ),
                    "message": (
                        "장기 메모리를 삭제했습니다."
                    ),
                },
                ensure_ascii=False,
            )

        return [
            search_user_memories,
            delete_user_memory,
        ]