import { z } from 'zod';

export const ragCitationSchema = z.object({
    documentId: z.number().int().positive(),
    chunkId: z.number().int().positive(),
    chunkIndex: z.number().int().min(0),
    pageNumber: z.number().int().positive().nullable(),
    fileName: z.string().min(1),
    similarity: z.number().min(-1).max(1),
});

export type RagCitation = z.infer<
    typeof ragCitationSchema
>;