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