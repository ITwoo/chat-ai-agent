import type { UserMemoryType } from '../generated/prisma/client.js';

export type UpsertUserMemoryInput = {
    type: UserMemoryType;
    memoryKey: string;
    content: string;
    sourceMessageId: number | null;
};