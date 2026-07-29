import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    UserMemory,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchUserMemoriesInput, UpsertUserMemoryInput } from './user-memory.types';

const DEFAULT_MEMORY_LIMIT = 50;
const MAX_MEMORY_LIMIT = 100;
const MAX_MEMORY_KEY_LENGTH = 120;
const MEMORY_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const DEFAULT_MEMORY_SEARCH_LIMIT = 10;
const MAX_MEMORY_SEARCH_LIMIT = 20;

@Injectable()
export class UserMemoryService {
    constructor(private readonly prisma: PrismaService) {}

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
        const memoryKey = this.normalizeMemoryKey(
            input.memoryKey,
        );
        const content = this.normalizeContent(input.content);

        await this.assertSourceMessageOwner(
            userId,
            input.sourceMessageId,
        );

        const confirmedAt = new Date();

        return this.prisma.userMemory.upsert({
            where: {
                userId_memoryKey: {
                    userId,
                    memoryKey,
                },
            },
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