import { z } from 'zod';

export const ragSearchToolInputSchema = z.object({
    query: z
        .string()
        .trim()
        .min(1)
        .describe(
            '업로드 문서에서 검색할 구체적인 질문 또는 검색 문장',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe(
            '검색할 최대 청크 수. 기본값은 5이고 최대 10이다.',
        ),
});

export type RagSearchToolInput = z.infer<
    typeof ragSearchToolInputSchema
>;