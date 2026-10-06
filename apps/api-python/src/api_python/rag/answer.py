import asyncio

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
)
from langchain_openai import (
    ChatOpenAI,
)

from api_python.config import settings
from api_python.rag.constants import (
    RAG_ANSWER_CONTEXT_TOKEN_BUDGET,
    RAG_ANSWER_TIMEOUT_SECONDS,
    UNKNOWN_CHUNK_TOKEN_COST,
)
from api_python.rag.security.constants import (
    RAG_ANSWER_PROMPT_VERSION,
)
from api_python.rag.security.messages import (
    create_rag_answer_messages,
)
from api_python.rag.types import (
    RagSearchResult,
)


class RagAnswerService:
    def __init__(self) -> None:
        self._model = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            reasoning_effort="low",
            max_retries=2,
        )

    def select_context_results(
        self,
        results: list[
            RagSearchResult
        ],
    ) -> list[RagSearchResult]:
        selected: list[
            RagSearchResult
        ] = []

        used_tokens = 0

        for result in results:
            token_count = (
                result.token_count
                or UNKNOWN_CHUNK_TOKEN_COST
            )

            exceeds_budget = (
                used_tokens
                + token_count
                > RAG_ANSWER_CONTEXT_TOKEN_BUDGET
            )

            if (
                selected
                and exceeds_budget
            ):
                continue

            selected.append(
                result
            )

            used_tokens += (
                token_count
            )

            if (
                used_tokens
                >= RAG_ANSWER_CONTEXT_TOKEN_BUDGET
            ):
                break

        return selected

    async def answer(
        self,
        question: str,
        results: list[
            RagSearchResult
        ],
    ) -> BaseMessage:
        if not results:
            return AIMessage(
                "업로드된 문서에서 질문과 관련된 근거를 찾지 못했습니다."
            )

        messages = (
            create_rag_answer_messages(
                question,
                results,
            )
        )

        return await asyncio.wait_for(
            self._model.ainvoke(
                messages,
                config={
                    "run_name": (
                        "rag_answer_generation"
                    ),
                    "tags": [
                        "rag-answer"
                    ],
                    "metadata": {
                        "llm_operation": (
                            "rag_answer_generation"
                        ),
                        "prompt_version": (
                            RAG_ANSWER_PROMPT_VERSION
                        ),
                    },
                },
            ),
            timeout=(
                RAG_ANSWER_TIMEOUT_SECONDS
            ),
        )


rag_answer_service = (
    RagAnswerService()
)