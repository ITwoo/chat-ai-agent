export const AGENT_JOB_QUEUE = 'agent-jobs';

export const AGENT_JOB_NAME = {
    HEALTH_CHECK: 'health-check',
} as const;

export const RAG_DOCUMENT_QUEUE = 'rag-document-jobs';

export const RAG_DOCUMENT_JOB_NAME = {
    INGEST: 'ingest-document',
} as const;