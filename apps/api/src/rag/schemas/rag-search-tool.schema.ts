import { z } from 'zod';

export const MAX_RAG_SEARCH_QUERIES = 3;

export const ragSearchToolInputSchema = z.object({
    queries: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(3)
        .describe(
            '업로드 문서 검색에 사용할 검색어 1~3개. ' +
            '첫 번째 검색어는 사용자 질문에 실제로 등장한 핵심 단어 또는 짧은 구절을 가능한 그대로 사용한다. ' +
            '두 번째와 세 번째 검색어에서만 관련 기술 용어, 약어, 동의어 또는 표현 변형을 사용한다. ' +
            '한 검색어에 여러 개념을 길게 결합하지 않는다. ' +
            '문서, 업로드, 설명, 알려줘, 요약, 정리 같은 요청 표현은 제외한다.',
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