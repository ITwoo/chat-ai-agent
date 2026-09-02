export type QueueJobContext = {
    requestId?: string;
};

export type HealthCheckJobData = QueueJobContext & {
    requestedAt: string;
};

export type HealthCheckJobResult = {
    requestedAt: string;
    processedAt: string;
    elapsedMs: number;
};

export type DocumentIngestionJobData = QueueJobContext & {
    documentId: number;
    userId: number;
    storageKey: string;
};

export type DocumentIngestionJobResult = {
    documentId: number;
    chunkCount: number;
};

export type RemoveDocumentIngestionJobResult = 'NOT_FOUND' | 'REMOVED' | 'ACTIVE';

export type DocumentIngestionJobSnapshot =
    | { state: 'NOT_FOUND' }
    | {
        state:
        | 'WAITING'
        | 'DELAYED'
        | 'ACTIVE'
        | 'COMPLETED'
        | 'FAILED'
        | 'UNKNOWN';
        failedReason: string | null
    };

export type UserMemoryExtractionJobData = QueueJobContext & {
    userId: number;
    messageId: number;
};

export type UserMemoryExtractionJobResult = {
    extractedCount: number;
    savedCount: number;
    archivedCount: number;
    skippedCount: number;
};

export type UserMemoryExtractionJobSnapshot =
    | { state: 'NOT_FOUND' }
    | {
        state:
        | 'WAITING'
        | 'DELAYED'
        | 'ACTIVE'
        | 'COMPLETED'
        | 'FAILED'
        | 'UNKNOWN';
        failedReason: string | null;
    };