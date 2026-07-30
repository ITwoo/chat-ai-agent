import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';
import { RecoverUserMemoryExtractionsResult } from './user-memory.types';

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

const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

type RecoveryTarget = {
    messageId: number;
    userId: number;
    status: 'PENDING' | 'PROCESSING';
    startedAt: Date | null;
};

type RecoveryAction =
    | 'REQUEUED'
    | 'RESET_TO_PENDING'
    | 'FAILED'
    | 'ACTIVE'
    | 'SKIPPED';

@Injectable()
export class UserMemoryJobStateService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly queueProducerService: QueueProducerService,
    ) {}

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

    private async markRecoveryFailed(
        target: RecoveryTarget,
        error: string,
    ): Promise<RecoveryAction> {
        const updated = await this.prisma.chatMessage.updateMany({
            where: {
                id: target.messageId,
                role: 'USER',
                room: { userId: target.userId },
                memoryExtractionStatus: target.status,
                ...(target.status === 'PROCESSING'
                    ? {
                        memoryExtractionStartedAt:
                            target.startedAt,
                    }
                    : {}),
            },
            data: {
                memoryExtractionStatus: 'FAILED',
                memoryExtractionError: error,
                memoryExtractionStartedAt: null,
                memoryExtractedAt: null,
            },
        });

        return updated.count === 1 ? 'FAILED' : 'SKIPPED';
    }

    private async resetProcessingToPending(
        target: RecoveryTarget,
    ): Promise<RecoveryAction> {
        const updated = await this.prisma.chatMessage.updateMany({
            where: {
                id: target.messageId,
                role: 'USER',
                room: { userId: target.userId },
                memoryExtractionStatus: 'PROCESSING',
                memoryExtractionStartedAt: target.startedAt,
            },
            data: {
                memoryExtractionStatus: 'PENDING',
                memoryExtractionError: null,
                memoryExtractionStartedAt: null,
            },
        });

        return updated.count === 1
            ? 'RESET_TO_PENDING'
            : 'SKIPPED';
    }

    private async recoverTarget(
        target: RecoveryTarget,
    ): Promise<RecoveryAction> {
        const snapshot =
            await this.queueProducerService.getUserMemoryExtractionJobSnapshot(
                target.messageId,
            );

        if (snapshot.state === 'ACTIVE') return 'ACTIVE';

        if (target.status === 'PENDING') {
            if (
                snapshot.state === 'WAITING' ||
                snapshot.state === 'DELAYED'
            ) {
                return 'SKIPPED';
            }

            if (snapshot.state === 'NOT_FOUND') {
                await this.queueProducerService.enqueueUserMemoryExtraction({
                    userId: target.userId,
                    messageId: target.messageId,
                });

                return 'REQUEUED';
            }

            return this.markRecoveryFailed(
                target,
                snapshot.state === 'FAILED'
                    ? snapshot.failedReason ||
                        'BullMQ 메모리 추출 Job이 실패했습니다.'
                    : `PENDING 상태와 BullMQ Job 상태가 일치하지 않습니다: ${snapshot.state}`,
            );
        }

        if (
            snapshot.state === 'WAITING' ||
            snapshot.state === 'DELAYED'
        ) {
            return this.resetProcessingToPending(target);
        }

        if (snapshot.state === 'NOT_FOUND') {
            const resetResult =
                await this.resetProcessingToPending(target);

            if (resetResult !== 'RESET_TO_PENDING') {
                return resetResult;
            }

            await this.queueProducerService.enqueueUserMemoryExtraction({
                userId: target.userId,
                messageId: target.messageId,
            });

            return 'REQUEUED';
        }

        return this.markRecoveryFailed(
            target,
            snapshot.state === 'FAILED'
                ? snapshot.failedReason ||
                    'BullMQ 메모리 추출 Job이 실패했습니다.'
                : `PROCESSING 상태와 BullMQ Job 상태가 일치하지 않습니다: ${snapshot.state}`,
        );
    }

    async recoverPendingAndStuckExtractions(): Promise<RecoverUserMemoryExtractionsResult> {
        const staleBefore = new Date(
            Date.now() - PROCESSING_STALE_AFTER_MS,
        );

        const messages = await this.prisma.chatMessage.findMany({
            where: {
                role: 'USER',
                OR: [
                    { memoryExtractionStatus: 'PENDING' },
                    {
                        memoryExtractionStatus: 'PROCESSING',
                        memoryExtractionStartedAt: {
                            lt: staleBefore,
                        },
                    },
                ],
            },
            select: {
                id: true,
                memoryExtractionStatus: true,
                memoryExtractionStartedAt: true,
                room: { select: { userId: true } },
            },
            orderBy: { id: 'asc' },
            take: RECOVERY_BATCH_SIZE,
        });

        const result: RecoverUserMemoryExtractionsResult = {
            checkedCount: messages.length,
            requeuedCount: 0,
            resetToPendingCount: 0,
            markedFailedCount: 0,
            activeCount: 0,
        };

        for (const message of messages) {
            const status = message.memoryExtractionStatus;

            if (status !== 'PENDING' && status !== 'PROCESSING') {
                continue;
            }

            try {
                const action = await this.recoverTarget({
                    messageId: message.id,
                    userId: message.room.userId,
                    status,
                    startedAt:
                        message.memoryExtractionStartedAt,
                });

                if (action === 'REQUEUED') result.requeuedCount++;
                if (action === 'RESET_TO_PENDING') {
                    result.resetToPendingCount++;
                }
                if (action === 'FAILED') result.markedFailedCount++;
                if (action === 'ACTIVE') result.activeCount++;
            } catch {
                continue;
            }
        }

        return result;
    }
}