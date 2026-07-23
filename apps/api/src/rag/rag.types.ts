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