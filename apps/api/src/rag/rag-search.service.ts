import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagEmbeddingService } from './rag-embedding.service';
import type { RagSearchResult } from './rag.types';
import { serializeVector } from './utils/rag-vector.util';
import { RAG_MIN_SIMILARITY } from './rag.constants';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const SEARCH_CANDIDATE_MULTIPLIER = 4;
const MAX_PREFERRED_CHUNKS_PER_DOCUMENT = 2;
const RRF_K = 60;
@Injectable()
export class RagSearchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ragEmbeddingService: RagEmbeddingService,
    ) {}

    async search(
        userId: number,
        query: string,
        limit = DEFAULT_SEARCH_LIMIT,
    ): Promise<RagSearchResult[]> {
        const normalizedQuery = query?.trim();

        if (!normalizedQuery) {
            throw new BadRequestException(
                '검색할 질문을 입력해주세요.',
            );
        }

        const searchLimit = this.normalizeLimit(limit);
        const candidateLimit = searchLimit * SEARCH_CANDIDATE_MULTIPLIER;
        const { embedding } = await this.ragEmbeddingService.embedText(normalizedQuery);
        const vector = serializeVector(embedding);

        const results = await this.prisma.$transaction(
            async (tx) => {

                await tx.$executeRaw`
                    SET LOCAL statement_timeout = '10s'
                `;
                
                await tx.$executeRaw`
                    SET LOCAL hnsw.iterative_scan = 'strict_order'
                `;

                return tx.$queryRaw<RagSearchResult[]>`
                    WITH search_query AS (
                        SELECT websearch_to_tsquery(
                            'simple'::regconfig,
                            ${normalizedQuery}
                        ) AS query
                    ),
                    vector_candidates AS (
                        SELECT
                            chunk."id" AS "chunkId",
                            (
                                ROW_NUMBER() OVER (
                                    ORDER BY chunk."embedding" <=> ${vector}::vector
                                )
                            )::integer AS "vectorRank"
                        FROM "RagDocumentChunk" AS chunk
                        INNER JOIN "RagDocument" AS document
                            ON document."id" = chunk."documentId"
                        WHERE document."userId" = ${userId}
                        AND document."status" = 'READY'
                        AND chunk."embedding" IS NOT NULL
                        ORDER BY chunk."embedding" <=> ${vector}::vector
                        LIMIT ${candidateLimit}
                    ),
                    keyword_candidates AS (
                        SELECT
                            chunk."id" AS "chunkId",
                            (
                                ROW_NUMBER() OVER (
                                    ORDER BY ts_rank_cd(
                                        to_tsvector(
                                            'simple'::regconfig,
                                            chunk."content"
                                        ),
                                        search_query.query
                                    ) DESC
                                )
                            )::integer AS "keywordRank"
                        FROM "RagDocumentChunk" AS chunk
                        INNER JOIN "RagDocument" AS document
                            ON document."id" = chunk."documentId"
                        CROSS JOIN search_query
                        WHERE document."userId" = ${userId}
                        AND document."status" = 'READY'
                        AND chunk."embedding" IS NOT NULL
                        AND to_tsvector(
                                'simple'::regconfig,
                                chunk."content"
                            ) @@ search_query.query
                        ORDER BY ts_rank_cd(
                            to_tsvector(
                                'simple'::regconfig,
                                chunk."content"
                            ),
                            search_query.query
                        ) DESC
                        LIMIT ${candidateLimit}
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
                                    1.0 / (${RRF_K} + vector_candidates."vectorRank"),
                                    0.0
                                )
                                +
                                COALESCE(
                                    1.0 / (${RRF_K} + keyword_candidates."keywordRank"),
                                    0.0
                                )
                            )::double precision AS "rrfScore"
                        FROM vector_candidates
                        FULL OUTER JOIN keyword_candidates
                            ON keyword_candidates."chunkId" =
                            vector_candidates."chunkId"
                        ORDER BY "rrfScore" DESC
                        LIMIT ${candidateLimit}
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
                            chunk."embedding" <=> ${vector}::vector
                        )::double precision AS "distance",
                        (
                            1 - (
                                chunk."embedding" <=> ${vector}::vector
                            )
                        )::double precision AS "similarity",
                        fused_candidates."vectorRank",
                        fused_candidates."keywordRank",
                        fused_candidates."rrfScore"
                    FROM fused_candidates
                    INNER JOIN "RagDocumentChunk" AS chunk
                        ON chunk."id" = fused_candidates."chunkId"
                    INNER JOIN "RagDocument" AS document
                        ON document."id" = chunk."documentId"
                    ORDER BY fused_candidates."rrfScore" DESC
                `;
            },
        );

        return this.selectDiverseResults(results, searchLimit);
    }

    private normalizeLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) {
            return DEFAULT_SEARCH_LIMIT;
        }

        return Math.min(limit, MAX_SEARCH_LIMIT);
    }

    private selectDiverseResults(results: RagSearchResult[], limit: number): RagSearchResult[] {
        const filteredResults = results.filter(
            (result) =>
                result.keywordRank !== null ||
                result.similarity >= RAG_MIN_SIMILARITY,
        );
        const selectedResults: RagSearchResult[] = [];
        const deferredResults: RagSearchResult[] = [];
        const documentChunkCounts = new Map<number, number>();

        for (const result of filteredResults) {
            const selectedDocumentCount = documentChunkCounts.get(result.documentId) ?? 0;
            /*const hasAdjacentChunk = selectedResults.some(
                (selected) => selected.documentId === result.documentId && Math.abs(selected.chunkIndex - result.chunkIndex) <= 1,
            ); // chunksize 1000 overlap 200 연속성을 해치는 필터링 임시 제거 */
            const shouldDefer = selectedDocumentCount >= MAX_PREFERRED_CHUNKS_PER_DOCUMENT

            if (shouldDefer) {
                deferredResults.push(result);
                continue;
            }
            
            selectedResults.push(result);
            documentChunkCounts.set(result.documentId, selectedDocumentCount + 1);

            if (selectedResults.length === limit) return selectedResults;
        }

        for (const result of deferredResults) {
            selectedResults.push(result);
            if (selectedResults.length === limit) break;
        }

        return selectedResults;
    }
}