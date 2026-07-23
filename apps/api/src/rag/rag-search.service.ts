import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagEmbeddingService } from './rag-embedding.service';
import type { RagSearchResult } from './rag.types';
import { serializeVector } from './utils/rag-vector.util';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;

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
        const { embedding } =
            await this.ragEmbeddingService.embedText(normalizedQuery);
        const vector = serializeVector(embedding);

        return this.prisma.$queryRaw<RagSearchResult[]>`
            SELECT
                chunk."id" AS "chunkId",
                chunk."documentId",
                chunk."chunkIndex",
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
            LIMIT ${searchLimit}
        `;
    }

    private normalizeLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) {
            return DEFAULT_SEARCH_LIMIT;
        }

        return Math.min(limit, MAX_SEARCH_LIMIT);
    }
}