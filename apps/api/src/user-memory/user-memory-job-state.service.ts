import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PrepareUserMemoryExtractionResult =
    | 'ENQUEUE'
    | 'SKIP_PROCESSING'
    | 'SKIP_COMPLETED';

export type ClaimUserMemoryExtractionResult =
    | 'PROCESS'
    | 'ALREADY_PROCESSING'
    | 'ALREADY_COMPLETED'
    | 'NOT_FOUND'
    | 'INVALID_STATE';

@Injectable()
export class UserMemoryJobStateService {
    constructor(private readonly prisma: PrismaService) {}

    async prepareForEnqueue(
        userId: number,
        messageId: number,
    ): Promise<PrepareUserMemoryExtractionResult> {
        const prepared =
            await this.prisma.chatMessage.updateMany({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                    OR: [
                        {
                            memoryExtractionStatus: null,
                        },
                        {
                            memoryExtractionStatus: {
                                in: ['PENDING', 'FAILED'],
                            },
                        },
                    ],
                },
                data: {
                    memoryExtractionStatus: 'PENDING',
                    memoryExtractionError: null,
                    memoryExtractionStartedAt: null,
                    memoryExtractedAt: null,
                },
            });

        if (prepared.count === 1) return 'ENQUEUE';

        const message =
            await this.prisma.chatMessage.findFirst({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                },
                select: {
                    memoryExtractionStatus: true,
                },
            });

        if (!message) {
            throw new Error(
                `메모리 추출 대상 메시지를 찾을 수 없습니다: userId=${userId}, messageId=${messageId}`,
            );
        }

        if (
            message.memoryExtractionStatus ===
            'PROCESSING'
        ) {
            return 'SKIP_PROCESSING';
        }

        if (
            message.memoryExtractionStatus ===
            'COMPLETED'
        ) {
            return 'SKIP_COMPLETED';
        }

        throw new Error(
            `메모리 추출 Job 등록 준비 실패: userId=${userId}, messageId=${messageId}, status=${message.memoryExtractionStatus}`,
        );
    }

    async claimForProcessing(
        userId: number,
        messageId: number,
    ): Promise<ClaimUserMemoryExtractionResult> {
        const claimed =
            await this.prisma.chatMessage.updateMany({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                    memoryExtractionStatus: 'PENDING',
                },
                data: {
                    memoryExtractionStatus: 'PROCESSING',
                    memoryExtractionError: null,
                    memoryExtractionStartedAt:
                        new Date(),
                },
            });

        if (claimed.count === 1) return 'PROCESS';

        const message =
            await this.prisma.chatMessage.findFirst({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                },
                select: {
                    memoryExtractionStatus: true,
                },
            });

        if (!message) return 'NOT_FOUND';

        if (
            message.memoryExtractionStatus ===
            'PROCESSING'
        ) {
            return 'ALREADY_PROCESSING';
        }

        if (
            message.memoryExtractionStatus ===
            'COMPLETED'
        ) {
            return 'ALREADY_COMPLETED';
        }

        return 'INVALID_STATE';
    }

    async markCompleted(
        userId: number,
        messageId: number,
    ): Promise<void> {
        const completed =
            await this.prisma.chatMessage.updateMany({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                    memoryExtractionStatus: 'PROCESSING',
                },
                data: {
                    memoryExtractionStatus: 'COMPLETED',
                    memoryExtractionError: null,
                    memoryExtractionStartedAt: null,
                    memoryExtractedAt: new Date(),
                },
            });

        if (completed.count !== 1) {
            throw new Error(
                `메모리 추출 완료 상태 저장 실패: userId=${userId}, messageId=${messageId}`,
            );
        }
    }

    async markFailed(
        userId: number,
        messageId: number,
        errorMessage: string,
        willRetry: boolean,
    ): Promise<boolean> {
        const result =
            await this.prisma.chatMessage.updateMany({
                where: {
                    id: messageId,
                    role: 'USER',
                    room: {
                        userId,
                    },
                    memoryExtractionStatus: 'PROCESSING',
                },
                data: {
                    memoryExtractionStatus: willRetry
                        ? 'PENDING'
                        : 'FAILED',
                    memoryExtractionError: errorMessage,
                    memoryExtractionStartedAt: null,
                    memoryExtractedAt: null,
                },
            });

        return result.count === 1;
    }
}