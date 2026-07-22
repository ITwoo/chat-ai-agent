export type HealthCheckJobData = {
    requestedAt: string;
};

export type HealthCheckJobResult = {
    requestedAt: string;
    processedAt: string;
    elapsedMs: number;
};