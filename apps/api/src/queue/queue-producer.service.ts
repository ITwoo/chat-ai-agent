import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE, RAG_DOCUMENT_JOB_NAME, RAG_DOCUMENT_QUEUE, USER_MEMORY_JOB_NAME, USER_MEMORY_QUEUE } from './queue.constants';
import { DocumentIngestionJobData, DocumentIngestionJobResult, DocumentIngestionJobSnapshot, HealthCheckJobData, HealthCheckJobResult, RemoveDocumentIngestionJobResult, UserMemoryExtractionJobData, UserMemoryExtractionJobResult, UserMemoryExtractionJobSnapshot } from './queue.types';

@Injectable()
export class QueueProducerService {
    constructor(
        @InjectQueue(AGENT_JOB_QUEUE)
        private readonly agentJobQueue: Queue<HealthCheckJobData, HealthCheckJobResult>,
        @InjectQueue(RAG_DOCUMENT_QUEUE)
        private readonly ragDocumentQueue: Queue<DocumentIngestionJobData, DocumentIngestionJobResult>,
        @InjectQueue(USER_MEMORY_QUEUE)
        private readonly userMemoryQueue: Queue<UserMemoryExtractionJobData, UserMemoryExtractionJobResult>,
    ) {}

    enqueueHealthCheck(): Promise<Job<HealthCheckJobData, HealthCheckJobResult>> {
        return this.agentJobQueue.add(AGENT_JOB_NAME.HEALTH_CHECK, {
            requestedAt: new Date().toISOString(),
        });
    }

    enqueueDocumentIngestion(
        data: DocumentIngestionJobData,
    ): Promise<Job<DocumentIngestionJobData, DocumentIngestionJobResult>> {
        return this.ragDocumentQueue.add(
            RAG_DOCUMENT_JOB_NAME.INGEST,
            data,
            {
                jobId: `rag-document-${data.documentId}`,
            },
        );
    }

    enqueueUserMemoryExtraction(
        data: UserMemoryExtractionJobData,
    ): Promise<
        Job<
            UserMemoryExtractionJobData,
            UserMemoryExtractionJobResult
        >
    > {
        return this.userMemoryQueue.add(
            USER_MEMORY_JOB_NAME.EXTRACT,
            data,
            {
                jobId: `user-memory-${data.messageId}`,
            },
        );
    }
    
    async removeDocumentIngestionJob(documentId: number): Promise<RemoveDocumentIngestionJobResult> {
        const jobId = `rag-document-${documentId}`;
        const job = await this.ragDocumentQueue.getJob(jobId);

        if (!job) return 'NOT_FOUND';

        const removed = await this.ragDocumentQueue.remove(jobId);
        if (removed === 1) return 'REMOVED';

        const remainingJob = await this.ragDocumentQueue.getJob(jobId);

        if (!remainingJob) return 'REMOVED';
        if (await remainingJob.isActive()) return 'ACTIVE';

        throw new Error(`RAG 문서 Job 제거 실패: jobId=${jobId}, state=${await remainingJob.getState()}`);
    }

    async getDocumentIngestionJobSnapshot(documentId: number): Promise<DocumentIngestionJobSnapshot> {
        const jobId = `rag-document-${documentId}`;
        const job = await this.ragDocumentQueue.getJob(jobId);

        if (!job) return { state: 'NOT_FOUND' };

        const state = await job.getState();

        switch (state) {
            case 'waiting':
                return { state: 'WAITING', failedReason: null };
            case 'delayed':
                return { state: 'DELAYED', failedReason: null };
            case 'active':
                return { state: 'ACTIVE', failedReason: null };
            case 'completed':
                return { state: 'COMPLETED', failedReason: null };
            case 'failed':
                return { state: 'FAILED', failedReason: job.failedReason || null };
            default:
                return { state: 'UNKNOWN', failedReason: null };
        }
    }

    async getUserMemoryExtractionJobSnapshot(
        messageId: number,
    ): Promise<UserMemoryExtractionJobSnapshot> {
        const job = await this.userMemoryQueue.getJob(
            `user-memory-${messageId}`,
        );

        if (!job) return { state: 'NOT_FOUND' };

        const state = await job.getState();

        switch (state) {
            case 'waiting':
                return { state: 'WAITING', failedReason: null };
            case 'delayed':
                return { state: 'DELAYED', failedReason: null };
            case 'active':
                return { state: 'ACTIVE', failedReason: null };
            case 'completed':
                return { state: 'COMPLETED', failedReason: null };
            case 'failed':
                return {
                    state: 'FAILED',
                    failedReason: job.failedReason || null,
                };
            default:
                return { state: 'UNKNOWN', failedReason: null };
        }
    }

}