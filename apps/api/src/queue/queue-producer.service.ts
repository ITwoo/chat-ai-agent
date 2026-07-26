import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE, RAG_DOCUMENT_JOB_NAME, RAG_DOCUMENT_QUEUE } from './queue.constants';
import { DocumentIngestionJobData, DocumentIngestionJobResult, HealthCheckJobData, HealthCheckJobResult, RemoveDocumentIngestionJobResult } from './queue.types';

@Injectable()
export class QueueProducerService {
    constructor(
        @InjectQueue(AGENT_JOB_QUEUE)
        private readonly agentJobQueue: Queue<HealthCheckJobData, HealthCheckJobResult>,
        @InjectQueue(RAG_DOCUMENT_QUEUE)
        private readonly ragDocumentQueue: Queue<DocumentIngestionJobData, DocumentIngestionJobResult>,
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
}