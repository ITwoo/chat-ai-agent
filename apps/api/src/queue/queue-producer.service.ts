import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE, RAG_DOCUMENT_JOB_NAME, RAG_DOCUMENT_QUEUE } from './queue.constants';
import { DocumentIngestionJobData, DocumentIngestionJobResult, HealthCheckJobData, HealthCheckJobResult } from './queue.types';

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
}