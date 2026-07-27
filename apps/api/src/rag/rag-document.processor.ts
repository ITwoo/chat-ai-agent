import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { UnrecoverableError, type Job } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
    RAG_DOCUMENT_JOB_NAME,
    RAG_DOCUMENT_QUEUE,
} from '../queue/queue.constants';
import type {
    DocumentIngestionJobData,
    DocumentIngestionJobResult,
} from '../queue/queue.types';
import { RagEmbeddingService } from './rag-embedding.service';
import { EmbeddedChunk } from './rag.types';
import { serializeVector } from './utils/rag-vector.util';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

type PrepareDocumentProcessingResult =
    | { type: 'PROCESS' }
    | { type: 'ALREADY_READY'; chunkCount: number };
@Injectable()
@Processor(RAG_DOCUMENT_QUEUE)
export class RagDocumentProcessor extends WorkerHost {
    private readonly logger = new Logger(RagDocumentProcessor.name);
    private readonly splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
    });

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly ragEmbeddingService: RagEmbeddingService,
    ) {
        super();
    }

    async process(
        job: Job<DocumentIngestionJobData, DocumentIngestionJobResult>,
    ): Promise<DocumentIngestionJobResult> {
        if (job.name !== RAG_DOCUMENT_JOB_NAME.INGEST) {
            throw new UnrecoverableError(`지원하지 않는 RAG 문서 Job입니다: ${job.name}`);
        }

        const { documentId, userId, storageKey } = job.data;

        try {
            const preparation = await this.prepareDocumentProcessing(job);

            if (preparation.type === 'ALREADY_READY') {
                await job.updateProgress(100);

                return {
                    documentId,
                    chunkCount: preparation.chunkCount,
                };
            }

            const content = await this.readDocument(storageKey);
            const chunks = await this.splitter.splitText(content);

            if (chunks.length === 0) {
                throw new UnrecoverableError('문서에서 저장할 텍스트를 찾을 수 없습니다.');
            }

            const embeddedChunks: EmbeddedChunk[] = [];

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];
                const result = await this.ragEmbeddingService.embedText(chunk);

                embeddedChunks.push({
                    chunkIndex,
                    content: chunk,
                    tokenCount: result.tokenCount,
                    embedding: result.embedding,
                });

                await job.updateProgress(
                    Math.round(((chunkIndex + 1) / chunks.length) * 90),
                );
            }

            await this.prisma.$transaction(async (tx) => {
                const processingDocument = await tx.ragDocument.updateMany({
                    where: {
                        id: documentId,
                        userId,
                        storageKey,
                        status: 'PROCESSING',
                    },
                    data: { error: null },
                });

                if (processingDocument.count !== 1) {
                    throw new UnrecoverableError(
                        `RAG 문서 상태가 변경되어 처리 결과를 저장할 수 없습니다: documentId=${documentId}`,
                    );
                }

                await tx.ragDocumentChunk.deleteMany({
                    where: { documentId },
                });

                for (const chunk of embeddedChunks) {
                    const vector = serializeVector(chunk.embedding);

                    await tx.$executeRaw`
                        INSERT INTO "RagDocumentChunk" (
                            "documentId",
                            "chunkIndex",
                            "content",
                            "tokenCount",
                            "embedding"
                        )
                        VALUES (
                            ${documentId},
                            ${chunk.chunkIndex},
                            ${chunk.content},
                            ${chunk.tokenCount},
                            ${vector}::vector
                        )
                    `;
                }

                await tx.ragDocument.update({
                    where: { id: documentId },
                    data: {
                        status: 'READY',
                        error: null,
                    },
                });
            });

            await job.updateProgress(100);

            this.logger.log(
                `RAG 문서 처리 완료: documentId=${documentId}, chunks=${chunks.length}`,
            );

            return {
                documentId,
                chunkCount: chunks.length,
            };
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error));

            await this.handleProcessingFailure(job, normalizedError);

            throw normalizedError;
        }
    }

    private async prepareDocumentProcessing(
        job: Job<DocumentIngestionJobData, DocumentIngestionJobResult>,
    ): Promise<PrepareDocumentProcessingResult> {
        const { documentId, userId, storageKey } = job.data;

        const claimed = await this.prisma.ragDocument.updateMany({
            where: {
                id: documentId,
                userId,
                storageKey,
                status: { in: ['PENDING', 'PROCESSING'] },
            },
            data: {
                status: 'PROCESSING',
                error: null,
            },
        });

        if (claimed.count === 1) {
            return { type: 'PROCESS' };
        }

        const document = await this.prisma.ragDocument.findFirst({
            where: { id: documentId, userId, storageKey },
            select: {
                status: true,
                _count: { select: { chunks: true } },
            },
        });

        if (!document) {
            throw new UnrecoverableError(`RAG 문서를 찾을 수 없습니다: documentId=${documentId}`);
        }

        if (document.status === 'READY') {
            if (document._count.chunks === 0) {
                throw new UnrecoverableError(`READY 문서에 저장된 청크가 없습니다: documentId=${documentId}`);
            }

            this.logger.warn(
                `이미 완료된 RAG 문서 Job을 건너뜁니다: documentId=${documentId}, jobId=${job.id}`,
            );

            return {
                type: 'ALREADY_READY',
                chunkCount: document._count.chunks,
            };
        }

        throw new UnrecoverableError(
            `현재 상태에서 RAG 문서를 처리할 수 없습니다: documentId=${documentId}, status=${document.status}`,
        );
    }

    private async handleProcessingFailure(
        job: Job<DocumentIngestionJobData, DocumentIngestionJobResult>,
        error: Error,
    ): Promise<void> {
        const { documentId, userId, storageKey } = job.data;
        const maxAttempts = job.opts.attempts ?? 1;
        const currentAttempt = job.attemptsMade + 1;
        const isUnrecoverable = error instanceof UnrecoverableError;
        const willRetry = !isUnrecoverable && currentAttempt < maxAttempts;

        const status = willRetry ? 'PENDING' : 'FAILED';
        const errorMessage = willRetry
            ? `문서 처리 실패, 재시도 예정 (${currentAttempt}/${maxAttempts}): ${error.message}`
            : error.message;

        try {
            await this.prisma.ragDocument.updateMany({
                where: {
                    id: documentId,
                    userId,
                    storageKey,
                    status: 'PROCESSING',
                },
                data: {
                    status,
                    error: errorMessage,
                },
            });
        } catch (updateError) {
            this.logger.error(
                `RAG 문서 실패 상태 저장 오류: documentId=${documentId}, error=${String(updateError)}`,
            );
        }

        const logMessage =
            `RAG 문서 처리 실패: documentId=${documentId}, attempt=${currentAttempt}/${maxAttempts}, ` +
            `willRetry=${willRetry}, error=${error.message}`;

        if (willRetry) this.logger.warn(logMessage);
        else this.logger.error(logMessage);
    }

    private async readDocument(storageKey: string): Promise<string> {
        const uploadDir = this.configService.get<string>('RAG_UPLOAD_DIR') ?? 'uploads/rag';
        const filePath = resolve(process.cwd(), uploadDir, storageKey);

        let content: string;

        try {
            content = await readFile(filePath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new UnrecoverableError(`RAG 원본 파일을 찾을 수 없습니다: storageKey=${storageKey}`);
            }

            throw error;
        }

        const normalizedContent = content.replace(/^\uFEFF/, '').trim();

        if (!normalizedContent) {
            throw new UnrecoverableError('RAG 문서가 비어 있습니다.');
        }

        return normalizedContent;
    }
}