import {
    RAG_RETRIEVAL_EVAL_CASES,
    RAG_RETRIEVAL_EVAL_K,
    type RagRetrievalEvalCase,
} from './eval/rag-retrieval-eval.dataset';

type RagRetrievalEvalMode =
    | 'semantic'
    | 'manual';

const MODE = getEvalMode();

type LoginResponse = {
    accessToken: string;
};

type RagSearchResult = {
    chunkId: number;
    documentId: number;
    chunkIndex: number;
    pageNumber: number | null;
    content: string;
    fileName: string;
    similarity: number;
    vectorRank: number | null;
    keywordRank: number | null;
    rrfScore: number;
};

type RagRetrievalEvalResult = {
    name: string;
    resultCount: number;
    retrievedFiles: string;
    hitAtK: boolean | null;
    reciprocalRank: number | null;
    passed: boolean;
};

const BASE_URL =
    process.env.BENCHMARK_BASE_URL ??
    'http://localhost:3000';

const USERNAME =
    getRequiredEnv('RAG_EVAL_USERNAME');

const PASSWORD =
    getRequiredEnv('RAG_EVAL_PASSWORD');

async function main() {
    console.log('RAG retrieval eval started');
    console.log(`Mode: ${MODE}`);

    const accessToken = await signIn();

    const results: RagRetrievalEvalResult[] = [];

    for (const testCase of RAG_RETRIEVAL_EVAL_CASES) {
        const result = await evaluateCase(
            accessToken,
            testCase,
        );

        results.push(result);
    }

    console.table(results);

    printMetrics(results);

    if (results.some((result) => !result.passed)) {
        process.exitCode = 1;
    }
}

async function evaluateCase(
    accessToken: string,
    testCase: RagRetrievalEvalCase,
): Promise<RagRetrievalEvalResult> {
    const results = await searchRag(
        accessToken,
        testCase,
    );

    const retrievedFiles = results
        .map((result) => result.fileName)
        .join(', ');

    if (testCase.negative) {
        return {
            name: testCase.name,
            resultCount: results.length,
            retrievedFiles,
            hitAtK: null,
            reciprocalRank: null,
            passed: results.length === 0,
        };
    }

    if (!testCase.expectedFile) {
        throw new Error(
            `${testCase.name}: expectedFile is required.`,
        );
    }

    const relevantIndex = results.findIndex(
        (result) =>
            result.fileName.endsWith(
                testCase.expectedFile!,
            ),
    );

    const hitAtK = relevantIndex >= 0;

    return {
        name: testCase.name,
        resultCount: results.length,
        retrievedFiles,
        hitAtK,
        reciprocalRank:
            hitAtK
                ? 1 / (relevantIndex + 1)
                : 0,
        passed: hitAtK,
    };
}

async function searchRag(
    accessToken: string,
    testCase: RagRetrievalEvalCase,
): Promise<RagSearchResult[]> {
    return request<RagSearchResult[]>(
        '/api/rag/search',
        {
            method: 'POST',
            body: JSON.stringify({
                query: testCase.query,
                limit: RAG_RETRIEVAL_EVAL_K,
                ...(MODE === 'manual'
                    ? {
                        lexicalQueries:
                            testCase.lexicalQueries,
                    }
                    : {}),
            }),
        },
        accessToken,
    );
}

async function signIn(): Promise<string> {
    const response = await request<LoginResponse>(
        '/api/auth/signin',
        {
            method: 'POST',
            body: JSON.stringify({
                username: USERNAME,
                password: PASSWORD,
            }),
        },
    );

    return response.accessToken;
}

function printMetrics(
    results: RagRetrievalEvalResult[],
): void {
    const positiveResults = results.filter(
        (result) => result.hitAtK !== null,
    );

    const negativeResults = results.filter(
        (result) => result.hitAtK === null,
    );

    const hitCount = positiveResults.filter(
        (result) => result.hitAtK,
    ).length;

    const hitRate =
        positiveResults.length > 0
            ? hitCount / positiveResults.length
            : 0;

    const mrr =
        positiveResults.length > 0
            ? positiveResults.reduce(
                (sum, result) =>
                    sum +
                    (result.reciprocalRank ?? 0),
                0,
            ) / positiveResults.length
            : 0;

    const negativePassedCount =
        negativeResults.filter(
            (result) => result.passed,
        ).length;

    const negativeAccuracy =
        negativeResults.length > 0
            ? negativePassedCount /
                negativeResults.length
            : 0;

    console.log(
        `Hit Rate@${RAG_RETRIEVAL_EVAL_K}: ` +
        `${formatPercent(hitRate)}`,
    );

    console.log(
        `MRR@${RAG_RETRIEVAL_EVAL_K}: ` +
        `${mrr.toFixed(3)}`,
    );

    console.log(
        'Negative Accuracy: ' +
        `${formatPercent(negativeAccuracy)}`,
    );
}

async function request<T>(
    path: string,
    init: RequestInit,
    accessToken?: string,
): Promise<T> {
    const response = await fetch(
        `${BASE_URL}${path}`,
        {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken
                    ? {
                        Authorization:
                            `Bearer ${accessToken}`,
                    }
                    : {}),
                ...init.headers,
            },
        },
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${text}`,
        );
    }

    return text
        ? JSON.parse(text) as T
        : undefined as T;
}

function getRequiredEnv(
    name: string,
): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} environment variable is required.`,
        );
    }

    return value;
}

function formatPercent(
    value: number,
): string {
    return `${(value * 100).toFixed(1)}%`;
}

void main().catch((error) => {
    console.error(
        'RAG retrieval eval failed:',
        error,
    );

    process.exitCode = 1;
});

function getEvalMode(): RagRetrievalEvalMode {
    const value =
        process.env.RAG_RETRIEVAL_EVAL_MODE
            ?.trim()
            .toLowerCase();

    if (!value || value === 'manual') {
        return 'manual';
    }

    if (value === 'semantic') {
        return 'semantic';
    }

    throw new Error(
        'RAG_RETRIEVAL_EVAL_MODE must be semantic or manual.',
    );
}