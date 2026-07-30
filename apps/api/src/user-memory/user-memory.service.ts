import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    UserMemory,
    UserMemoryType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { RelevantUserMemory, SearchUserMemoriesInput, UpsertUserMemoryInput, UserMemoryEmbeddingBackfillBatchResult } from './user-memory.types';
import { RagEmbeddingService } from '../rag/rag-embedding.service.js';
import { serializeVector } from '../rag/utils/rag-vector.util.js';

const DEFAULT_MEMORY_LIMIT = 50;
const MAX_MEMORY_LIMIT = 100;
const MAX_MEMORY_KEY_LENGTH = 120;
const MEMORY_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const DEFAULT_MEMORY_SEARCH_LIMIT = 10;
const MAX_MEMORY_SEARCH_LIMIT = 20;

const DEFAULT_RELEVANT_MEMORY_LIMIT = 8;
const MAX_RELEVANT_MEMORY_LIMIT = 20;
const RELEVANT_MEMORY_CANDIDATE_MULTIPLIER = 3;
const USER_MEMORY_MIN_SIMILARITY = 0.45;

const DEFAULT_EMBEDDING_BACKFILL_LIMIT = 25;
const MAX_EMBEDDING_BACKFILL_LIMIT = 100;

type UserMemoryEmbeddingBackfillRow = {
    id: number;
    type: UserMemoryType;
    memoryKey: string;
    content: string;
};

@Injectable()
export class UserMemoryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ragEmbeddingService: RagEmbeddingService,
    ) {}

    private normalizeMemoryKey(memoryKey: string): string {
        const normalizedMemoryKey = memoryKey.trim().toLowerCase();

        if (!normalizedMemoryKey) {
            throw new BadRequestException(
                '메모리 키를 입력해주세요.',
            );
        }

        if (normalizedMemoryKey.length > MAX_MEMORY_KEY_LENGTH) {
            throw new BadRequestException(
                `메모리 키는 ${MAX_MEMORY_KEY_LENGTH}자를 초과할 수 없습니다.`,
            );
        }

        if (!MEMORY_KEY_PATTERN.test(normalizedMemoryKey)) {
            throw new BadRequestException(
                '메모리 키는 영문 소문자와 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.',
            );
        }

        return normalizedMemoryKey;
    }

    private normalizeContent(content: string): string {
        const normalizedContent = content.trim();

        if (!normalizedContent) {
            throw new BadRequestException(
                '메모리 내용을 입력해주세요.',
            );
        }

        return normalizedContent;
    }

    private createEmbeddingText(
        type: UpsertUserMemoryInput['type'],
        memoryKey: string,
        content: string,
    ): string {
        return `[${type}] ${memoryKey}\n${content}`;
    }

    private normalizeLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) {
            return DEFAULT_MEMORY_LIMIT;
        }

        return Math.min(limit, MAX_MEMORY_LIMIT);
    }

    private normalizeSearchLimit(limit?: number): number {
        if (limit === undefined) return DEFAULT_MEMORY_SEARCH_LIMIT;

        if (!Number.isInteger(limit) || limit < 1) {
            return DEFAULT_MEMORY_SEARCH_LIMIT;
        }

        return Math.min(limit, MAX_MEMORY_SEARCH_LIMIT);
    }

    private normalizeRelevantLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) return DEFAULT_RELEVANT_MEMORY_LIMIT;

        return Math.min(limit, MAX_RELEVANT_MEMORY_LIMIT);
    }

    private normalizeEmbeddingBackfillLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) return DEFAULT_EMBEDDING_BACKFILL_LIMIT;

        return Math.min(limit, MAX_EMBEDDING_BACKFILL_LIMIT);
    }

    private async assertSourceMessageOwner(
        userId: number,
        sourceMessageId: number | null,
    ): Promise<void> {
        if (sourceMessageId === null) return;

        const sourceMessage =
            await this.prisma.chatMessage.findFirst({
                where: {
                    id: sourceMessageId,
                    room: {
                        userId,
                    },
                },
                select: {
                    id: true,
                },
            });

        if (!sourceMessage) {
            throw new BadRequestException(
                '메모리 출처 메시지를 찾을 수 없거나 접근할 수 없습니다.',
            );
        }
    }

    async getActiveMemories(
        userId: number,
        limit = DEFAULT_MEMORY_LIMIT,
    ): Promise<UserMemory[]> {
        return this.prisma.userMemory.findMany({
            where: {
                userId,
                status: 'ACTIVE',
            },
            orderBy: [
                {
                    lastConfirmedAt: 'desc',
                },
            ],
            take: this.normalizeLimit(limit),
        });
    }

    async searchActiveMemories(
        userId: number,
        input: SearchUserMemoriesInput,
    ): Promise<UserMemory[]> {
        const query = input.query?.trim();

        return this.prisma.userMemory.findMany({
            where: {
                userId,
                status: 'ACTIVE',
                ...(input.type ? { type: input.type } : {}),
                ...(query
                    ? {
                        OR: [
                            {
                                memoryKey: {
                                    contains: query,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                content: {
                                    contains: query,
                                    mode: 'insensitive',
                                },
                            },
                        ],
                    }
                    : {}),
            },
            orderBy: {
                updatedAt: 'desc',
            },
            take: this.normalizeSearchLimit(input.limit),
        });
    }

    async searchRelevantMemories(
        userId: number,
        query: string,
        limit = DEFAULT_RELEVANT_MEMORY_LIMIT,
    ): Promise<RelevantUserMemory[]> {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) return [];

        const searchLimit = this.normalizeRelevantLimit(limit);
        const candidateLimit = searchLimit * RELEVANT_MEMORY_CANDIDATE_MULTIPLIER;
        const { embedding } = await this.ragEmbeddingService.embedText(normalizedQuery);
        const vector = serializeVector(embedding);

        const candidates = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL hnsw.iterative_scan = 'strict_order'`;

            return tx.$queryRaw<RelevantUserMemory[]>`
                SELECT
                    memory."id",
                    memory."type",
                    memory."memoryKey",
                    memory."content",
                    (
                        1 - (
                            memory."embedding" <=> ${vector}::vector
                        )
                    )::double precision AS "similarity"
                FROM "UserMemory" AS memory
                WHERE memory."userId" = ${userId}
                AND memory."status" = 'ACTIVE'
                AND memory."embedding" IS NOT NULL
                ORDER BY memory."embedding" <=> ${vector}::vector
                LIMIT ${candidateLimit}
            `;
        });

        return candidates
            .filter((memory) => memory.similarity >= USER_MEMORY_MIN_SIMILARITY)
            .slice(0, searchLimit);
    }

    async backfillMissingEmbeddings(
        afterId = 0,
        limit = DEFAULT_EMBEDDING_BACKFILL_LIMIT,
    ): Promise<UserMemoryEmbeddingBackfillBatchResult> {
        const take = this.normalizeEmbeddingBackfillLimit(limit);

        const memories = await this.prisma.$queryRaw<UserMemoryEmbeddingBackfillRow[]>`
            SELECT "id", "type", "memoryKey", "content"
            FROM "UserMemory"
            WHERE "embedding" IS NULL
            AND "id" > ${afterId}
            ORDER BY "id" ASC
            LIMIT ${take}
        `;

        let updatedCount = 0;
        const failedMemoryIds: number[] = [];

        for (const memory of memories) {
            try {
                const text = this.createEmbeddingText(
                    memory.type,
                    memory.memoryKey,
                    memory.content,
                );

                const { embedding } = await this.ragEmbeddingService.embedText(text);
                const vector = serializeVector(embedding);

                const updated = await this.prisma.$executeRaw`
                    UPDATE "UserMemory"
                    SET "embedding" = ${vector}::vector
                    WHERE "id" = ${memory.id}
                    AND "embedding" IS NULL
                `;

                updatedCount += updated;
            } catch {
                failedMemoryIds.push(memory.id);
            }
        }

        return {
            selectedCount: memories.length,
            updatedCount,
            failedMemoryIds,
            nextCursor: memories.at(-1)?.id ?? null,
        };
    }

    async getActiveMemoryById(
        userId: number,
        memoryId: number,
    ): Promise<UserMemory> {
        const memory = await this.prisma.userMemory.findFirst({
            where: {
                id: memoryId,
                userId,
                status: 'ACTIVE',
            },
        });

        if (!memory) {
            throw new NotFoundException(
                '활성 사용자 메모리를 찾을 수 없습니다.',
            );
        }

        return memory;
    }

    async upsertMemory(
        userId: number,
        input: UpsertUserMemoryInput,
    ): Promise<UserMemory> {
        const memoryKey = this.normalizeMemoryKey(input.memoryKey);
        const content = this.normalizeContent(input.content);

        await this.assertSourceMessageOwner(userId, input.sourceMessageId);

        const embeddingText = this.createEmbeddingText(input.type, memoryKey, content);
        const { embedding } = await this.ragEmbeddingService.embedText(embeddingText);
        const vector = serializeVector(embedding);
        const confirmedAt = new Date();

        return this.prisma.$transaction(async (tx) => {
            const memory = await tx.userMemory.upsert({
                where: { userId_memoryKey: { userId, memoryKey } },
                create: {
                    userId,
                    type: input.type,
                    memoryKey,
                    content,
                    status: 'ACTIVE',
                    sourceMessageId: input.sourceMessageId,
                    lastConfirmedAt: confirmedAt,
                },
                update: {
                    type: input.type,
                    content,
                    status: 'ACTIVE',
                    sourceMessageId: input.sourceMessageId,
                    lastConfirmedAt: confirmedAt,
                },
            });

            await tx.$executeRaw`
                UPDATE "UserMemory"
                SET "embedding" = ${vector}::vector
                WHERE "id" = ${memory.id}
            `;

            return memory;
        });
    }

    async archiveMemory(
        userId: number,
        memoryId: number,
    ): Promise<void> {
        const result = await this.prisma.userMemory.updateMany({
            where: {
                id: memoryId,
                userId,
            },
            data: {
                status: 'ARCHIVED',
            },
        });

        if (result.count !== 1) {
            throw new NotFoundException(
                '사용자 메모리를 찾을 수 없습니다.',
            );
        }
    }

    async deleteMemory(
        userId: number,
        memoryId: number,
    ): Promise<void> {
        const result = await this.prisma.userMemory.deleteMany({
            where: {
                id: memoryId,
                userId,
            },
        });

        if (result.count !== 1) {
            throw new NotFoundException(
                '사용자 메모리를 찾을 수 없습니다.',
            );
        }
    }

    async deleteActiveMemory(
        userId: number,
        memoryId: number,
    ): Promise<void> {
        const result = await this.prisma.userMemory.deleteMany({
            where: {
                id: memoryId,
                userId,
                status: 'ACTIVE',
            },
        });

        if (result.count !== 1) {
            throw new NotFoundException(
                '삭제할 활성 사용자 메모리를 찾을 수 없습니다.',
            );
        }
    }
}