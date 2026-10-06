from fastapi import HTTPException, status
from openai import AsyncOpenAI

from api_python.config import settings
from api_python.rag.constants import (
    RAG_EMBEDDING_DIMENSIONS,
    RAG_EMBEDDING_MODEL,
)
from api_python.rag.types import (
    RagEmbeddingResult,
)


class RagEmbeddingService:
    def __init__(self) -> None:
        self._openai = AsyncOpenAI(
            api_key=settings.openai_api_key,
        )

    async def embed_text(
        self,
        text: str,
    ) -> RagEmbeddingResult:
        normalized_text = text.strip()

        if not normalized_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="임베딩할 텍스트가 비어 있습니다.",
            )

        response = (
            await self._openai.embeddings.create(
                model=RAG_EMBEDDING_MODEL,
                input=normalized_text,
                dimensions=RAG_EMBEDDING_DIMENSIONS,
                encoding_format="float",
            )
        )

        if not response.data:
            raise RuntimeError(
                "OpenAI가 임베딩 결과를 반환하지 않았습니다."
            )

        embedding = response.data[0].embedding

        if (
            len(embedding)
            != RAG_EMBEDDING_DIMENSIONS
        ):
            raise RuntimeError(
                "임베딩 차원이 일치하지 않습니다: "
                f"expected={RAG_EMBEDDING_DIMENSIONS}, "
                f"actual={len(embedding)}"
            )

        return RagEmbeddingResult(
            embedding=list(embedding),
            token_count=(
                response.usage.total_tokens
                if response.usage
                else 0
            ),
        )


rag_embedding_service = (
    RagEmbeddingService()
)