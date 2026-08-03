import { z } from 'zod';

export const USER_MEMORY_EXTRACTION_MAX_COUNT = 5;
export const USER_MEMORY_CONFIDENCE_THRESHOLD = 0.85;

const USER_MEMORY_KEY_PATTERN =
    /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/;

const userMemoryKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(USER_MEMORY_KEY_PATTERN);

const confidenceSchema = z.number().min(0).max(1);

const userMemoryUpsertCandidateSchema = z.object({
    action: z.literal('UPSERT'),
    type: z.enum(['PROFILE', 'PREFERENCE', 'GOAL', 'CONSTRAINT']),
    memoryKey: userMemoryKeySchema,
    content: z.string().trim().min(1).max(500),
    confidence: confidenceSchema,
});

const userMemoryArchiveCandidateSchema = z.object({
    action: z.literal('ARCHIVE'),
    memoryKey: userMemoryKeySchema,
    confidence: confidenceSchema,
});

export const userMemoryCandidateSchema = z.union([
    userMemoryUpsertCandidateSchema,
    userMemoryArchiveCandidateSchema,
]);

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