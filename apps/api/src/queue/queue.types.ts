export type HealthCheckJobData = {
    requestedAt: string;
};

export type HealthCheckJobResult = {
    requestedAt: string;
    processedAt: string;
    elapsedMs: number;
};

export type DocumentIngestionJobData = {
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

export type UserMemoryExtractionJobData = {
    userId: number;
    messageId: number;
};

export type UserMemoryExtractionJobResult = {
    extractedCount: number;
    savedCount: number;
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