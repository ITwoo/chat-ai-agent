export const RagDocumentStatus = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    READY: 'READY',
    FAILED: 'FAILED',
} as const;

export type RagDocumentStatus = (typeof RagDocumentStatus)[keyof typeof RagDocumentStatus];

export type RagDocumentListItemResponse = {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: RagDocumentStatus;
    error: string | null;
    chunkCount: number;
    createdAt: string;
    updatedAt: string;
};

export type RagDocumentsPageResponse = {
    documents: RagDocumentListItemResponse[];
    nextCursor: number | null;
};

export type UploadRagDocumentResponse = {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: RagDocumentStatus;
    jobId: string;
    createdAt: string;
};

export type DeleteRagDocumentResponse = {
    documentId: number;
    deleted: true;
};

export type ReprocessRagDocumentResponse = {
    documentId: number;
    status: typeof RagDocumentStatus.PENDING;
};