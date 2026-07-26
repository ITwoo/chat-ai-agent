import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { access, unlink } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';
import { GetRagDocumentsQueryDto } from './dto/get-rag-documents-query.dto';
import { DeleteRagDocumentResult, RagDocumentsPageResult, ReprocessRagDocumentResult } from './rag.types';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

const DEFAULT_DOCUMENT_LIST_LIMIT = 20;
@Injectable()
export class RagDocumentService {
    private readonly logger = new Logger(RagDocumentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly queueProducerService: QueueProducerService,
        private readonly configService: ConfigService,
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
        let documentId: number | undefined;

        try {
            const document = await this.prisma.ragDocument.create({
                data: {
                    userId,
                    fileName: file.originalname,
                    storageKey: file.filename,
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
                await unlink(file.path).catch((cleanupError: unknown) => {
                    this.logger.warn(
                        `RAG 업로드 파일 정리 실패: ${String(cleanupError)}`,
                    );
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

    private getStoredFilePath(storageKey: string): string {
        const uploadDir = this.configService.get<string>('RAG_UPLOAD_DIR') ?? 'uploads/rag';
        return resolve(process.cwd(), uploadDir, storageKey);
    }

    private async assertStoredFileExists(storageKey: string): Promise<void> {
        try {
            await access(this.getStoredFilePath(storageKey));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new ConflictException('원본 파일이 없어 문서를 재처리할 수 없습니다.');
            }

            throw error;
        }
    }

    private async deleteStoredFile(storageKey: string): Promise<void> {
        const filePath = this.getStoredFilePath(storageKey);

        try {
            await unlink(filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;

            this.logger.warn(`RAG 원본 파일 삭제 실패: storageKey=${storageKey}, error=${String(error)}`);
        }
    }
}