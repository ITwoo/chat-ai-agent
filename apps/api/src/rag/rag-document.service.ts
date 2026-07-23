import { Injectable, Logger } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';

@Injectable()
export class RagDocumentService {
    private readonly logger = new Logger(RagDocumentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly queueProducerService: QueueProducerService,
    ) {}

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
}