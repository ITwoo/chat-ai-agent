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
const HYBRID_RRF_K = 60;
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
                        )::double precision AS "similarity"
                    FROM "RagDocumentChunk" AS chunk
                    INNER JOIN "RagDocument" AS document
                        ON document."id" = chunk."documentId"
                    WHERE document."userId" = ${userId}
                    AND document."status" = 'READY'
                    AND chunk."embedding" IS NOT NULL
                    ORDER BY
                        chunk."embedding" <=> ${vector}::vector
                    LIMIT ${candidateLimit}
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
        const filteredResults = results.filter((result) => result.similarity >= RAG_MIN_SIMILARITY);
        const selectedResults: RagSearchResult[] = [];
        const deferredResults: RagSearchResult[] = [];
        const documentChunkCounts = new Map<number, number>();

        for (const result of filteredResults) {
            const selectedDocumentCount = documentChunkCounts.get(result.documentId) ?? 0;
            const hasAdjacentChunk = selectedResults.some(
                (selected) => selected.documentId === result.documentId && Math.abs(selected.chunkIndex - result.chunkIndex) <= 1,
            );
            const shouldDefer =
                selectedDocumentCount >= MAX_PREFERRED_CHUNKS_PER_DOCUMENT ||
                hasAdjacentChunk;

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