import { z } from 'zod';

export const MAX_RAG_SEARCH_QUERIES = 3;

export const ragSearchToolInputSchema = z.object({
    queries: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(MAX_RAG_SEARCH_QUERIES)
        .describe(
            '업로드 문서에서 찾을 핵심 검색어 후보 1~3개. ' +
            '문서, 업로드, 설명, 알려줘, 요약, 정리 같은 요청 표현은 제외하고 ' +
            '실제 문서에 등장할 가능성이 높은 핵심 용어와 표현 변형을 사용한다.',
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