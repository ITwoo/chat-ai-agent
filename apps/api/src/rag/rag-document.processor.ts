import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Job } from 'bullmq';
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
            throw new Error(`지원하지 않는 RAG 문서 Job입니다: ${job.name}`);
        }

        const { documentId, userId, storageKey } = job.data;

        try {
            const document = await this.prisma.ragDocument.findFirst({
                where: { id: documentId, userId, storageKey },
                select: { id: true, status: true },
            });

            if (!document) {
                throw new Error(`RAG 문서를 찾을 수 없습니다: documentId=${documentId}`);
            }

            await this.prisma.ragDocument.update({
                where: { id: documentId },
                data: { status: 'PROCESSING', error: null },
            });

            const content = await this.readDocument(storageKey);
            const chunks = await this.splitter.splitText(content);

            if (chunks.length === 0) {
                throw new Error('문서에서 저장할 텍스트를 찾을 수 없습니다.');
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
            const message = error instanceof Error ? error.message : String(error);

            await this.prisma.ragDocument.updateMany({
                where: { id: documentId, userId, storageKey },
                data: { status: 'FAILED', error: message },
            });

            this.logger.error(
                `RAG 문서 처리 실패: documentId=${documentId}, error=${message}`,
            );

            throw error instanceof Error ? error : new Error(message);
        }
    }

    private async readDocument(storageKey: string): Promise<string> {
        const uploadDir = this.configService.get<string>('RAG_UPLOAD_DIR') ?? 'uploads/rag';
        const filePath = resolve(process.cwd(), uploadDir, storageKey);
        const content = await readFile(filePath, 'utf8');

        return content.replace(/^\uFEFF/, '').trim();
    }
}