import { RagDocumentStatus } from "../generated/prisma/enums";

export type RagEmbeddingResult = {
    embedding: number[];
    tokenCount: number;
};

export type EmbeddedChunk = {
    chunkIndex: number;
    content: string;
    tokenCount: number;
    embedding: number[];
};

export type RagSearchResult = {
    chunkId: number;
    documentId: number;
    chunkIndex: number;
    content: string;
    tokenCount: number | null;
    fileName: string;
    distance: number;
    similarity: number;
};

export type RagDocumentListItem = {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: RagDocumentStatus;
    error: string | null;
    chunkCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export type RagDocumentsPageResult = {
    documents: RagDocumentListItem[];
    nextCursor: number | null;
};

export type DeleteRagDocumentResult = {
    documentId: number;
    deleted: true;
};

export type ReprocessRagDocumentResult = {
    documentId: number;
    status: 'PENDING';
};