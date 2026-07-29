import { z } from 'zod';

export const USER_MEMORY_EXTRACTION_MAX_COUNT = 5;
export const USER_MEMORY_CONFIDENCE_THRESHOLD = 0.85;

const USER_MEMORY_KEY_PATTERN =
    /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/;

export const userMemoryCandidateSchema = z.object({
    type: z.enum([
        'PROFILE',
        'PREFERENCE',
        'GOAL',
        'CONSTRAINT',
    ]),
    memoryKey: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(USER_MEMORY_KEY_PATTERN),
    content: z.string().trim().min(1).max(500),
    confidence: z.number().min(0).max(1),
});

export const userMemoryExtractionSchema = z.object({
    memories: z
        .array(userMemoryCandidateSchema)
        .max(USER_MEMORY_EXTRACTION_MAX_COUNT),
});

export type UserMemoryCandidate = z.infer<
    typeof userMemoryCandidateSchema
>;

export type UserMemoryExtraction = z.infer<
    typeof userMemoryExtractionSchema
>;