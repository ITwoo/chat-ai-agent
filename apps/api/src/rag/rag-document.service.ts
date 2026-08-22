import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';
import { GetRagDocumentsQueryDto } from './dto/get-rag-documents-query.dto';
import { DeleteRagDocumentResult, RagDocumentsPageResult, RecoverStuckRagDocumentsResult, ReprocessRagDocumentResult } from './rag.types';

import { RagFileStorageService } from './storage/rag-file-storage.service';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

const DEFAULT_DOCUMENT_LIST_LIMIT = 20;

const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;
const PROCESSING_RECOVERY_BATCH_SIZE = 100;

@Injectable()
export class RagDocumentService {
    private readonly logger = new Logger(RagDocumentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly queueProducerService: QueueProducerService,
        private readonly ragFileStorageService: RagFileStorageService,
    ) {}

    async getDocuments(userId: number, query: GetRagDocumentsQueryDto): Promise<RagDocumentsPageResult> {
        const limit = query.limit ?? DEFAULT_DOCUMENT_LIST_LIMIT;

        const documents = await this.prisma.ragDocument.findMany({
            where: {
                userId,
                ...(query.cursor !== undefined ? { id: { lt: query.cursor } } : {}),
            },
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                status: true,
                error: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { chunks: true } },
            },
            orderBy: { id: 'desc' },
            take: limit + 1,
        });

        const hasNextPage = documents.length > limit;
        const pageDocuments = hasNextPage ? documents.slice(0, limit) : documents;

        return {
            documents: pageDocuments.map(({ _count, ...document }) => ({ ...document, chunkCount: _count.chunks })),
            nextCursor: hasNextPage ? pageDocuments[pageDocuments.length - 1]?.id ?? null : null,
        };
    }

    async createPendingDocument(
        userId: number,
        file: Express.Multer.File,
    ) {
        const extension = extname(file.originalname).toLowerCase();
        const storageKey = `${randomUUID()}${extension}`;

        await this.ragFileStorageService.write(storageKey, file.buffer);

        let documentId: number | undefined;

        try {
            const document = await this.prisma.ragDocument.create({
                data: {
                    userId,
                    fileName: file.originalname,
                    storageKey,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                },
                select: {
                    id: true,
                    fileName: true,
                    storageKey: true,
                    mimeType: true,
                    sizeBytes: true,
                    status: true,
                    createdAt: true,
                },
            });

            documentId = document.id;

            const job =
                await this.queueProducerService.enqueueDocumentIngestion({
                    documentId: document.id,
                    userId,
                    storageKey: document.storageKey,
                });

            return {
                id: document.id,
                fileName: document.fileName,
                mimeType: document.mimeType,
                sizeBytes: document.sizeBytes,
                status: document.status,
                jobId: job.id,
                createdAt: document.createdAt,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (documentId !== undefined) {
                await this.prisma.ragDocument
                    .update({
                        where: {
                            id: documentId,
                        },
                        data: {
                            status: 'FAILED',
                            error: `문서 처리 Job 등록 실패: ${message}`,
                        },
                    })
                    .catch((updateError: unknown) => {
                        this.logger.warn(
                            `RAG 문서 실패 상태 저장 오류: ${String(updateError)}`,
                        );
                    });
            } else {
                await this.ragFileStorageService.delete(storageKey).catch((cleanupError: unknown) => {
                    this.logger.warn(`RAG 업로드 파일 정리 실패: ${String(cleanupError)}`);
                });
            }

            throw error;
        }
    }

    async reprocessDocument(userId: number, documentId: number): Promise<ReprocessRagDocumentResult> {
        const document = await this.prisma.ragDocument.findFirst({
            where: { id: documentId, userId },
            select: { id: true, storageKey: true },
        });

        if (!document) {
            throw new NotFoundException('재처리할 RAG 문서를 찾을 수 없습니다.');
        }

        await this.assertStoredFileExists(document.storageKey);

        const removeResult = await this.queueProducerService.removeDocumentIngestionJob(document.id);

        if (removeResult === 'ACTIVE') {
            throw new ConflictException('현재 처리 중인 RAG 문서는 다시 처리할 수 없습니다.');
        }

        const updated = await this.prisma.ragDocument.updateMany({
            where: { id: document.id, userId },
            data: { status: 'PENDING', error: null },
        });

        if (updated.count !== 1) {
            throw new NotFoundException('재처리할 RAG 문서를 찾을 수 없습니다.');
        }

        try {
            await this.queueProducerService.enqueueDocumentIngestion({
                documentId: document.id,
                userId,
                storageKey: document.storageKey,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            await this.prisma.ragDocument.updateMany({
                where: { id: document.id, userId, status: 'PENDING' },
                data: { status: 'FAILED', error: `문서 재처리 Job 등록 실패: ${message}` },
            }).catch((updateError: unknown) => {
                this.logger.warn(`RAG 문서 재처리 실패 상태 저장 오류: ${String(updateError)}`);
            });

            throw error;
        }

        return { documentId: document.id, status: 'PENDING' };
    }

    async deleteDocument(userId: number, documentId: number): Promise<DeleteRagDocumentResult> {
        const document = await this.prisma.ragDocument.findFirst({
            where: { id: documentId, userId },
            select: { id: true, storageKey: true },
        });

        if (!document) {
            throw new NotFoundException('삭제할 RAG 문서를 찾을 수 없습니다.');
        }

        const jobResult = await this.queueProducerService.removeDocumentIngestionJob(document.id);

        if (jobResult === 'ACTIVE') {
            throw new ConflictException('현재 처리 중인 RAG 문서는 삭제할 수 없습니다.');
        }

        await this.prisma.ragDocument.deleteMany({
            where: { id: document.id, userId },
        });

        await this.deleteStoredFile(document.storageKey);

        return { documentId: document.id, deleted: true };
    }

    private async assertStoredFileExists(storageKey: string): Promise<void> {
        const exists = await this.ragFileStorageService.exists(storageKey);

        if (!exists) {
            throw new ConflictException('원본 파일이 없어 문서를 재처리할 수 없습니다.');
        }
    }

    private async deleteStoredFile(storageKey: string): Promise<void> {
        try {
            await this.ragFileStorageService.delete(storageKey);
        } catch (error) {
            this.logger.warn(`RAG 원본 파일 삭제 실패: storageKey=${storageKey}, error=${String(error)}`);
        }
    }

    private async recoverProcessingDocument(
        document: {
            id: number;
            userId: number;
            storageKey: string;
            updatedAt: Date;
        },
    ): Promise<'REQUEUED' | 'PENDING' | 'FAILED' | 'ACTIVE' | 'SKIPPED'> {
        const snapshot = await this.queueProducerService.getDocumentIngestionJobSnapshot(document.id);

        if (snapshot.state === 'ACTIVE') return 'ACTIVE';

        if (snapshot.state === 'WAITING' || snapshot.state === 'DELAYED') {
            const updated = await this.prisma.ragDocument.updateMany({
                where: {
                    id: document.id,
                    userId: document.userId,
                    storageKey: document.storageKey,
                    status: 'PROCESSING',
                    updatedAt: document.updatedAt,
                },
                data: { status: 'PENDING', error: null },
            });

            return updated.count === 1 ? 'PENDING' : 'SKIPPED';
        }

        if (snapshot.state === 'FAILED') {
            const updated = await this.prisma.ragDocument.updateMany({
                where: {
                    id: document.id,
                    userId: document.userId,
                    storageKey: document.storageKey,
                    status: 'PROCESSING',
                    updatedAt: document.updatedAt,
                },
                data: {
                    status: 'FAILED',
                    error: snapshot.failedReason
                        ? `BullMQ 문서 처리 최종 실패: ${snapshot.failedReason}`
                        : 'BullMQ 문서 처리 Job이 최종 실패했습니다.',
                },
            });

            return updated.count === 1 ? 'FAILED' : 'SKIPPED';
        }

        if (snapshot.state === 'COMPLETED' || snapshot.state === 'UNKNOWN') {
            const updated = await this.prisma.ragDocument.updateMany({
                where: {
                    id: document.id,
                    userId: document.userId,
                    storageKey: document.storageKey,
                    status: 'PROCESSING',
                    updatedAt: document.updatedAt,
                },
                data: {
                    status: 'FAILED',
                    error:
                        snapshot.state === 'COMPLETED'
                            ? 'BullMQ Job은 완료됐지만 문서 상태가 PROCESSING으로 남았습니다.'
                            : 'BullMQ Job 상태를 확인할 수 없어 문서 복구가 필요합니다.',
                },
            });

            return updated.count === 1 ? 'FAILED' : 'SKIPPED';
        }

        const claimed = await this.prisma.ragDocument.updateMany({
            where: {
                id: document.id,
                userId: document.userId,
                storageKey: document.storageKey,
                status: 'PROCESSING',
                updatedAt: document.updatedAt,
            },
            data: { status: 'PENDING', error: null },
        });

        if (claimed.count !== 1) return 'SKIPPED';

        try {
            await this.queueProducerService.enqueueDocumentIngestion({
                documentId: document.id,
                userId: document.userId,
                storageKey: document.storageKey,
            });

            return 'REQUEUED';
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            await this.prisma.ragDocument.updateMany({
                where: {
                    id: document.id,
                    userId: document.userId,
                    storageKey: document.storageKey,
                    status: 'PENDING',
                },
                data: {
                    status: 'FAILED',
                    error: `고아 PROCESSING 문서 Job 재등록 실패: ${message}`,
                },
            });

            throw error;
        }
    }

    async recoverStuckProcessingDocuments(): Promise<RecoverStuckRagDocumentsResult> {
        const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS);

        const documents = await this.prisma.ragDocument.findMany({
            where: {
                status: 'PROCESSING',
                updatedAt: { lt: staleBefore },
            },
            select: {
                id: true,
                userId: true,
                storageKey: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'asc' },
            take: PROCESSING_RECOVERY_BATCH_SIZE,
        });

        const result: RecoverStuckRagDocumentsResult = {
            checkedCount: documents.length,
            requeuedCount: 0,
            resetToPendingCount: 0,
            markedFailedCount: 0,
            activeCount: 0,
        };

        for (const document of documents) {
            try {
                const recoveryResult = await this.recoverProcessingDocument(document);

                if (recoveryResult === 'REQUEUED') result.requeuedCount++;
                if (recoveryResult === 'PENDING') result.resetToPendingCount++;
                if (recoveryResult === 'FAILED') result.markedFailedCount++;
                if (recoveryResult === 'ACTIVE') result.activeCount++;
            } catch (error) {
                this.logger.error(
                    `RAG PROCESSING 문서 복구 실패: documentId=${document.id}, error=${String(error)}`,
                );
            }
        }

        if (documents.length > 0) {
            this.logger.log(
                `RAG PROCESSING 문서 복구 완료: checked=${result.checkedCount}, requeued=${result.requeuedCount}, ` +
                `pending=${result.resetToPendingCount}, failed=${result.markedFailedCount}, active=${result.activeCount}`,
            );
        }

        return result;
    }

}