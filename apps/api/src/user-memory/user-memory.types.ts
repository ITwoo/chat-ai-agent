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