from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from fastapi import (
    HTTPException,
    status,
)

from api_python.rag.constants import (
    DEFAULT_SEARCH_LIMIT,
    MAX_PREFERRED_CHUNKS_PER_DOCUMENT,
    MAX_SEARCH_LIMIT,
    RAG_MIN_SIMILARITY,
    RRF_K,
    SEARCH_CANDIDATE_MULTIPLIER,
)
from api_python.rag.embedding import (
    RagEmbeddingService,
)
from api_python.rag.types import (
    RagSearchResult,
)
from api_python.rag.utils.vector import (
    serialize_vector,
)


class RagSearchService:
    def __init__(
        self,
        session: AsyncSession,
        embedding_service: (
            RagEmbeddingService
        ),
    ) -> None:
        self._session = session
        self._embedding_service = (
            embedding_service
        )

    async def search(
        self,
        user_id: int,
        semantic_query: str,
        limit: int = (
            DEFAULT_SEARCH_LIMIT
        ),
        lexical_queries: (
            list[str] | None
        ) = None,
    ) -> list[RagSearchResult]:
        normalized_query = (
            semantic_query.strip()
        )

        if not normalized_query:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="검색할 질문을 입력해주세요.",
            )

        normalized_lexical_queries = (
            list(
                dict.fromkeys(
                    query.strip()
                    for query in [
                        normalized_query,
                        *(
                            lexical_queries
                            or []
                        ),
                    ]
                    if query.strip()
                )
            )
        )

        search_limit = (
            self._normalize_limit(
                limit
            )
        )

        candidate_limit = (
            search_limit
            * SEARCH_CANDIDATE_MULTIPLIER
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

        lexical_queries_sql = (
            " UNION ALL ".join(
                f"""
                SELECT
                    {index}::integer
                        AS "queryIndex",
                    websearch_to_tsquery(
                        'simple'::regconfig,
                        :lexical_{index}
                    ) AS query
                """
                for index, _
                in enumerate(
                    normalized_lexical_queries
                )
            )
        )

        sql = text(
            f"""
            SET LOCAL statement_timeout = '10s';
            SET LOCAL hnsw.iterative_scan = 'strict_order';

            WITH raw_search_queries AS (
                {lexical_queries_sql}
            ),
            search_queries AS (
                SELECT
                    MIN("queryIndex")::integer
                        AS "queryIndex",
                    query
                FROM raw_search_queries
                GROUP BY query
            ),
            vector_candidates AS (
                SELECT
                    chunk."id" AS "chunkId",
                    (
                        ROW_NUMBER() OVER (
                            ORDER BY
                                chunk."embedding"
                                    <=> CAST(:vector AS vector),
                                chunk."id" ASC
                        )
                    )::integer AS "vectorRank"
                FROM "RagDocumentChunk" AS chunk
                INNER JOIN "RagDocument" AS document
                    ON document."id" =
                       chunk."documentId"
                WHERE document."userId" = :user_id
                  AND document."status" = 'READY'
                  AND chunk."embedding" IS NOT NULL
                ORDER BY
                    chunk."embedding"
                        <=> CAST(:vector AS vector),
                    chunk."id" ASC
                LIMIT :candidate_limit
            ),
            keyword_ranked_by_query AS (
                SELECT
                    ranked."chunkId",
                    search_query."queryIndex",
                    ranked."keywordScore",
                    (
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                search_query."queryIndex"
                            ORDER BY
                                ranked."keywordScore" DESC,
                                ranked."chunkId" ASC
                        )
                    )::integer AS "keywordRank"
                FROM search_queries
                    AS search_query
                CROSS JOIN LATERAL (
                    SELECT
                        chunk."id"
                            AS "chunkId",
                        ts_rank_cd(
                            to_tsvector(
                                'simple'::regconfig,
                                chunk."content"
                            ),
                            search_query.query
                        )::double precision
                            AS "keywordScore"
                    FROM "RagDocumentChunk"
                        AS chunk
                    INNER JOIN "RagDocument"
                        AS document
                        ON document."id" =
                           chunk."documentId"
                    WHERE document."userId"
                            = :user_id
                      AND document."status"
                            = 'READY'
                      AND chunk."embedding"
                            IS NOT NULL
                      AND to_tsvector(
                            'simple'::regconfig,
                            chunk."content"
                          ) @@ search_query.query
                    ORDER BY
                        "keywordScore" DESC,
                        chunk."id" ASC
                    LIMIT :candidate_limit
                ) AS ranked
            ),
            keyword_fused AS (
                SELECT
                    "chunkId",
                    SUM(
                        1.0 / (
                            {RRF_K}
                            + "keywordRank"
                        )
                    )::double precision
                        AS "lexicalRrfScore",
                    MAX(
                        "keywordScore"
                    )::double precision
                        AS "bestKeywordScore"
                FROM keyword_ranked_by_query
                GROUP BY "chunkId"
            ),
            keyword_candidates AS (
                SELECT
                    "chunkId",
                    (
                        ROW_NUMBER() OVER (
                            ORDER BY
                                "lexicalRrfScore" DESC,
                                "bestKeywordScore" DESC,
                                "chunkId" ASC
                        )
                    )::integer
                        AS "keywordRank"
                FROM keyword_fused
                ORDER BY "keywordRank"
                LIMIT :candidate_limit
            ),
            fused_candidates AS (
                SELECT
                    COALESCE(
                        vector_candidates."chunkId",
                        keyword_candidates."chunkId"
                    ) AS "chunkId",
                    vector_candidates."vectorRank",
                    keyword_candidates."keywordRank",
                    (
                        COALESCE(
                            1.0 / (
                                {RRF_K}
                                + vector_candidates."vectorRank"
                            ),
                            0.0
                        )
                        +
                        COALESCE(
                            1.0 / (
                                {RRF_K}
                                + keyword_candidates."keywordRank"
                            ),
                            0.0
                        )
                    )::double precision
                        AS "rrfScore"
                FROM vector_candidates
                FULL OUTER JOIN
                    keyword_candidates
                    ON keyword_candidates."chunkId"
                     = vector_candidates."chunkId"
                ORDER BY
                    "rrfScore" DESC,
                    "chunkId" ASC
                LIMIT :candidate_limit
            )
            SELECT
                chunk."id" AS "chunkId",
                chunk."documentId",
                chunk."chunkIndex",
                chunk."pageNumber",
                chunk."content",
                chunk."tokenCount",
                document."fileName",
                (
                    chunk."embedding"
                        <=> CAST(:vector AS vector)
                )::double precision
                    AS "distance",
                (
                    1 - (
                        chunk."embedding"
                            <=> CAST(:vector AS vector)
                    )
                )::double precision
                    AS "similarity",
                fused_candidates."vectorRank",
                fused_candidates."keywordRank",
                fused_candidates."rrfScore"
            FROM fused_candidates
            INNER JOIN "RagDocumentChunk"
                AS chunk
                ON chunk."id" =
                   fused_candidates."chunkId"
            INNER JOIN "RagDocument"
                AS document
                ON document."id" =
                   chunk."documentId"
            ORDER BY
                fused_candidates."rrfScore"
                    DESC,
                chunk."id"
            """
        )

        params: dict[
            str,
            object,
        ] = {
            "vector": vector,
            "user_id": user_id,
            "candidate_limit": (
                candidate_limit
            ),
        }

        for index, query in enumerate(
            normalized_lexical_queries
        ):
            params[
                f"lexical_{index}"
            ] = query

        async with self._session.begin():
            result = (
                await self._session.execute(
                    sql,
                    params,
                )
            )

            rows = (
                result.mappings().all()
            )

        search_results = [
            RagSearchResult(
                chunk_id=row["chunkId"],
                document_id=row[
                    "documentId"
                ],
                chunk_index=row[
                    "chunkIndex"
                ],
                page_number=row[
                    "pageNumber"
                ],
                content=row["content"],
                token_count=row[
                    "tokenCount"
                ],
                file_name=row[
                    "fileName"
                ],
                distance=float(
                    row["distance"]
                ),
                similarity=float(
                    row["similarity"]
                ),
                vector_rank=row[
                    "vectorRank"
                ],
                keyword_rank=row[
                    "keywordRank"
                ],
                rrf_score=float(
                    row["rrfScore"]
                ),
            )
            for row in rows
        ]

        return (
            self._select_diverse_results(
                search_results,
                search_limit,
            )
        )

    @staticmethod
    def _normalize_limit(
        limit: int,
    ) -> int:
        if limit < 1:
            return DEFAULT_SEARCH_LIMIT

        return min(
            limit,
            MAX_SEARCH_LIMIT,
        )

    @staticmethod
    def _select_diverse_results(
        results: list[
            RagSearchResult
        ],
        limit: int,
    ) -> list[RagSearchResult]:
        filtered = [
            result
            for result in results
            if (
                result.keyword_rank
                is not None
                or result.similarity
                >= RAG_MIN_SIMILARITY
            )
        ]

        selected: list[
            RagSearchResult
        ] = []

        deferred: list[
            RagSearchResult
        ] = []

        document_counts: dict[
            int,
            int,
        ] = {}

        for result in filtered:
            count = document_counts.get(
                result.document_id,
                0,
            )

            if (
                count
                >= MAX_PREFERRED_CHUNKS_PER_DOCUMENT
            ):
                deferred.append(
                    result
                )
                continue

            selected.append(
                result
            )

            document_counts[
                result.document_id
            ] = count + 1

            if (
                len(selected)
                == limit
            ):
                return selected

        for result in deferred:
            selected.append(
                result
            )

            if len(selected) == limit:
                break

        return selected