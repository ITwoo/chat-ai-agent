export type RagRetrievalEvalCase = {
    name: string;
    query: string;
    expectedFile?: string;
    lexicalQueries?: string[];
    hardNegative?: boolean;
    negative?: boolean;
    answerable?: boolean;
};

export const RAG_RETRIEVAL_EVAL_K = 5;

export const RAG_RETRIEVAL_EVAL_CASES:
RagRetrievalEvalCase[] = [
    {
        name: 'tf-idf-definition',
        query:
            'TF IDF는 어떤 방식으로 중요한 단어를 찾는다고 설명해?',
        expectedFile:
            '01_search_ranking_basics.pdf',
    },
    {
        name: 'idf-meaning',
        query:
            '문서 빈도가 낮은 단어에 더 높은 정보 가치를 주는 개념이 뭐야?',
        expectedFile:
            '01_search_ranking_basics.pdf',
        lexicalQueries: [
            'IDF',
            'Document Frequency',
        ],
    },
    {
        name: 'bm25-saturation',
        query:
            'BM25에서 같은 단어가 반복될 때 점수 증가를 완화하는 개념을 설명해줘.',
        expectedFile:
            '01_search_ranking_basics.pdf',
    },
    {
        name: 'hybrid-rag',
        query:
            'semantic search와 lexical search를 함께 쓰는 이유가 뭐야?',
        expectedFile:
            '02_vector_search_and_hybrid_rag.pdf',
    },
    {
        name: 'rrf',
        query:
            '서로 다른 검색기의 점수 스케일을 맞추지 않고 순위로 합치는 방법은?',
        expectedFile:
            '02_vector_search_and_hybrid_rag.pdf',
        lexicalQueries: [
            'RRF',
            'Reciprocal Rank Fusion',
        ],
    },
    {
        name: 'hnsw',
        query:
            '벡터 검색에서 HNSW는 왜 사용하는가?',
        expectedFile:
            '02_vector_search_and_hybrid_rag.pdf',
    },
    {
        name: 'operation-key',
        query:
            'Agent 생성 요청이 재시도되어도 중복 생성을 막는 방법을 설명해줘.',
        expectedFile:
            '03_agent_reliability_and_approval.pdf',
        lexicalQueries: [
            'operationKey',
            '멱등성',
        ],
    },
    {
        name: 'stale-approval',
        query:
            '승인 대기 중 데이터가 바뀌었을 때 오래된 승인을 막는 방법은?',
        expectedFile:
            '03_agent_reliability_and_approval.pdf',
        lexicalQueries: [
            'expectedVersion',
            'stale approval',
        ],
    },
    {
        name: 'checkpoint-resume',
        query:
            '서버 재시작 뒤에도 승인 흐름을 복구하려면 어떻게 해야 해?',
        expectedFile:
            '03_agent_reliability_and_approval.pdf',
        lexicalQueries: [
            'PostgreSQL checkpointer',
            'interrupt resume',
        ],
    },
    {
        name: 'queue-recovery',
        query:
            'PROCESSING 상태가 오래 남거나 Queue에서 Job이 사라졌을 때 어떻게 복구해?',
        expectedFile:
            '04_async_jobs_and_recovery.pdf',
    },
    {
        name: 'retry-idempotency',
        query:
            'Queue retry와 멱등성을 같이 고려해야 하는 이유는?',
        expectedFile:
            '04_async_jobs_and_recovery.pdf',
        lexicalQueries: [
            'retry idempotency',
            'operationKey',
        ],
    },
    {
        name: 'recall-at-k',
        query:
            'Recall@K가 무엇을 측정하는 지표인지 설명해줘.',
        expectedFile:
            '05_rag_evaluation_and_observability.pdf',
    },
    {
        name: 'mrr',
        query:
            '첫 번째 정답의 순위가 중요한 RAG 검색 평가 지표는 무엇이야?',
        expectedFile:
            '05_rag_evaluation_and_observability.pdf',
    },
    {
        name: 'faithfulness',
        query:
            'RAG 답변이 검색 근거 밖 내용을 지어내지 않았는지 평가하는 기준은?',
        expectedFile:
            '05_rag_evaluation_and_observability.pdf',
    },
    {
        name: 'meal-planning',
        query:
            '1인 가구에서 식재료 구매 빈도를 어떻게 정해야 해?',
        expectedFile:
            '06_household_meal_planning.pdf',
    },
    {
        name: 'hard-negative-ranking-score',
        query:
            '식단 계획에서 점수를 준다는 내용이 BM25 랭킹 점수를 의미하나?',
        expectedFile:
            '06_household_meal_planning.pdf',
        hardNegative: true,
    },
    {
        name: 'jeju-restaurant-unanswerable',
        query:
            '제주도 흑돼지 맛집 중 평점 1위 식당 이름을 알려줘.',
        expectedFile:
            '06_household_meal_planning.pdf',
        answerable: false,
    },
    {
        name: 'negative-kubernetes',
        query:
            'Kubernetes HPA가 CPU 사용률을 기준으로 pod를 늘리는 원리를 설명해줘.',
        negative: true,
    },
];