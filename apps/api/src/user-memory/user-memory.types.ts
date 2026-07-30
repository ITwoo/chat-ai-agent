import type { UserMemoryType } from '../generated/prisma/client.js';

export type UpsertUserMemoryInput = {
    type: UserMemoryType;
    memoryKey: string;
    content: string;
    sourceMessageId: number | null;
};

export type SearchUserMemoriesInput = {
    query?: string;
    type?: UserMemoryType;
    limit?: number;
};

export type RecoverUserMemoryExtractionsResult = {
    checkedCount: number;
    requeuedCount: number;
    resetToPendingCount: number;
    markedFailedCount: number;
    activeCount: number;
};

export type RelevantUserMemory = {
    id: number;
    type: UserMemoryType;
    memoryKey: string;
    content: string;
    similarity: number;
};