import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ChatOpenAI } from '@langchain/openai';
import {
    HumanMessage,
    SystemMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import {
    Pool,
    type QueryResultRow,
} from 'pg';
import { ragCitationSchema } from '../src/rag/schemas/rag-citation.schema';
import { RAG_RETRIEVAL_EVAL_CASES } from './eval/rag-retrieval-eval.dataset';

interface EvidenceChunk extends QueryResultRow {
    id: number;
    documentId: number;
    chunkIndex: number;
    pageNumber: number | null;
    content: string;
    fileName: string;
}

const agentEvalResultSchema = z.object({
    name: z.string(),
    query: z.string(),
    expectedFile: z.string().nullable(),
    negative: z.boolean(),
    status: z.enum([
        'COMPLETED',
        'APPROVAL_REQUIRED',
        'FAILED',
        'CANCELLED',
    ]),
    messageId: z.number().int().positive().nullable(),
    answer: z.string().nullable(),
    citations: ragCitationSchema.array(),
    passed: z.boolean(),
});

const agentEvalFileSchema = z.object({
    createdAt: z.string(),
    results: agentEvalResultSchema.array(),
});

const answerJudgeSchema = z.object({
    faithfulness: z.boolean().nullable(),
    answerRelevance: z.boolean(),
    unanswerableHandled: z.boolean().nullable(),
    reason: z.string().max(500),
});

type AgentEvalResult = z.infer<
    typeof agentEvalResultSchema
>;

type AnswerEvalResult = {
    name: string;
    answerable: boolean;
    status:
        | 'JUDGED'
        | 'SKIPPED_RETRIEVAL'
        | 'SKIPPED_INCOMPLETE';
    faithfulness: boolean | null;
    answerRelevance: boolean | null;
    unanswerableHandled: boolean | null;
    passed: boolean;
    reason: string;
};

const INPUT_PATH = resolve(
    process.cwd(),
    process.env.RAG_ANSWER_EVAL_INPUT?.trim() ||
        'eval-results/rag-agent-latest.json',
);

const OUTPUT_PATH = resolve(
    process.cwd(),
    process.env.RAG_ANSWER_EVAL_OUTPUT?.trim() ||
        'eval-results/rag-answer-latest.json',
);

const pool = new Pool({
    connectionString:
        getRequiredEnv('DATABASE_URL'),
});

const judge = new ChatOpenAI({
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
    model:
        process.env.RAG_EVAL_JUDGE_MODEL?.trim() ||
        getRequiredEnv('OPENAI_MODEL'),
    reasoning: {
        effort: 'low',
    },
    maxRetries: 1,
}).withStructuredOutput(
    answerJudgeSchema,
    {
        name: 'evaluate_rag_answer',
    },
);

async function main(): Promise<void> {
    console.log('RAG answer eval started');

    const input = agentEvalFileSchema.parse(
        JSON.parse(
            await readFile(
                INPUT_PATH,
                'utf8',
            ),
        ),
    );

    const evalCases =
        filterEvalCases(input.results);

    console.log(
        `Cases: ${evalCases
            .map((result) => result.name)
            .join(', ')}`,
    );

    const results: AnswerEvalResult[] = [];

    for (const result of evalCases) {
        const evaluation =
            await evaluateAnswer(result);

        results.push(evaluation);

        console.log(
            `[${result.name}] ` +
            `${evaluation.status} ` +
            `passed=${evaluation.passed}`,
        );
    }

    console.table(
        results.map((result) => ({
            name: result.name,
            status: result.status,
            faithfulness:
                result.faithfulness,
            answerRelevance:
                result.answerRelevance,
            unanswerableHandled:
                result.unanswerableHandled,
            passed: result.passed,
        })),
    );

    printMetrics(results);

    await saveResults(results);

    if (
        results.some(
            (result) =>
                result.status === 'JUDGED' &&
                !result.passed,
        )
    ) {
        process.exitCode = 1;
    }
}

async function evaluateAnswer(
    result: AgentEvalResult,
): Promise<AnswerEvalResult> {
    const answerable = getAnswerable(result.name);

    if (
        result.status !== 'COMPLETED' ||
        !result.answer
    ) {
        return {
            name: result.name,
            answerable,
            status: 'SKIPPED_INCOMPLETE',
            faithfulness: null,
            answerRelevance: null,
            unanswerableHandled: null,
            passed: false,
            reason:
                'Agent 응답이 정상 완료되지 않았습니다.',
        };
    }

    /*
     * Retrieval 단계가 실패했다면 Answer Judge로
     * 다시 평가하지 않는다.
     *
     * Retrieval 실패와 Answer 생성 실패를
     * 서로 다른 품질 문제로 분리하기 위함이다.
     */
    if (!result.passed) {
        return {
            name: result.name,
            answerable,
            status: 'SKIPPED_RETRIEVAL',
            faithfulness: null,
            answerRelevance: null,
            unanswerableHandled: null,
            passed: false,
            reason:
                'Retrieval 평가를 통과하지 못해 Answer 평가는 생략했습니다.',
        };
    }

    const evidence =
        await loadEvidence(result);

    const evaluation =
        await judge.invoke([
            new SystemMessage(
                [
                    '너는 RAG 답변 품질 평가자다.',
                    '',
                    '반드시 제공된 질문, 답변, 검색 근거만 평가한다.',
                    '외부 지식을 평가 근거로 사용하지 않는다.',
                    '',
                    'answerable=true:',
                    '- faithfulness: 답변의 중요한 사실 주장이 검색 근거로 뒷받침되면 true',
                    '- answerRelevance: 질문에 직접 답하고 있으면 true',
                    '- unanswerableHandled는 null',
                    '',
                    'answerable=false:',
                    '- 제공된 검색 근거만으로 사용자의 구체적인 질문에 답할 수 없는 경우다.',
                    '- 근거에 없는 구체적인 사실을 만들어내지 않고 정보 부족을 명확히 알리면 unanswerableHandled=true',
                    '- 정보 부족을 알리는 답변도 질문에 적절히 대응했다면 answerRelevance=true',
                    '- faithfulness는 null',
                    '',
                    'reason은 판단 근거를 한두 문장으로만 작성한다.',
                ].join('\n'),
            ),
            new HumanMessage(
                JSON.stringify(
                    {
                        answerable,
                        question: result.query,
                        answer: result.answer,
                        evidence,
                    },
                    null,
                    2,
                ),
            ),
        ]);

    const passed = answerable
        ? (
            evaluation.answerRelevance &&
            evaluation.faithfulness === true
        )
        : (
            evaluation.answerRelevance &&
            evaluation.unanswerableHandled === true
        );

    return {
        name: result.name,
        answerable,
        status: 'JUDGED',
        faithfulness:
            evaluation.faithfulness,
        answerRelevance:
            evaluation.answerRelevance,
        unanswerableHandled:
            evaluation.unanswerableHandled,
        passed,
        reason: evaluation.reason,
    };
}

async function loadEvidence(
    result: AgentEvalResult,
) {
    if (result.citations.length === 0) {
        return [];
    }

    const chunkIds = [
        ...new Set(
            result.citations.map(
                (citation) =>
                    citation.chunkId,
            ),
        ),
    ];

    const { rows: chunks } =
        await pool.query<EvidenceChunk>(
            `
                SELECT
                    chunk."id",
                    chunk."documentId",
                    chunk."chunkIndex",
                    chunk."pageNumber",
                    chunk."content",
                    document."fileName"
                FROM "RagDocumentChunk" AS chunk
                INNER JOIN "RagDocument" AS document
                    ON document."id" = chunk."documentId"
                WHERE chunk."id" = ANY($1::int[])
            `,
            [chunkIds],
        );

    const chunksById =
        new Map<number, EvidenceChunk>(
            chunks.map((chunk) => [
                chunk.id,
                chunk,
            ]),
        );

    return result.citations.map(
        (citation) => {
            const chunk =
                chunksById.get(
                    citation.chunkId,
                );

            if (!chunk) {
                throw new Error(
                    `${result.name}: ` +
                    `citation chunkId=${citation.chunkId}를 찾을 수 없습니다.`,
                );
            }

            return {
                documentId:
                    chunk.documentId,
                chunkId:
                    chunk.id,
                chunkIndex:
                    chunk.chunkIndex,
                pageNumber:
                    chunk.pageNumber,
                fileName:
                    chunk.fileName,
                content:
                    chunk.content,
            };
        },
    );
}

function filterEvalCases(
    results: AgentEvalResult[],
): AgentEvalResult[] {
    const value =
        process.env
            .RAG_ANSWER_EVAL_CASES
            ?.trim();

    if (!value) {
        return results;
    }

    const names = new Set(
        value
            .split(',')
            .map((name) =>
                name.trim(),
            )
            .filter(Boolean),
    );

    const unknownNames = [
        ...names,
    ].filter(
        (name) =>
            !results.some(
                (result) =>
                    result.name === name,
            ),
    );

    if (unknownNames.length > 0) {
        throw new Error(
            'Unknown RAG answer eval cases: ' +
            unknownNames.join(', '),
        );
    }

    return results.filter(
        (result) =>
            names.has(result.name),
    );
}

function printMetrics(
    results: AnswerEvalResult[],
): void {
    const judged = results.filter(
        (result) =>
            result.status === 'JUDGED',
    );

    const positive = judged.filter(
        (result) => !result.answerable,
    );

    const negative = judged.filter(
        (result) => result.answerable,
    );

    const faithfulnessRate =
        calculateRate(
            positive.filter(
                (result) =>
                    result.faithfulness === true,
            ).length,
            positive.length,
        );

    const relevanceRate =
        calculateRate(
            judged.filter(
                (result) =>
                    result.answerRelevance === true,
            ).length,
            judged.length,
        );

    const unanswerableRate =
        calculateRate(
            negative.filter(
                (result) =>
                    result.unanswerableHandled === true,
            ).length,
            negative.length,
        );

    console.log('');
    console.log(
        `Judged: ${judged.length}/${results.length}`,
    );

    console.log(
        `Faithfulness: ${faithfulnessRate}`,
    );

    console.log(
        `Answer Relevance: ${relevanceRate}`,
    );

    console.log(
        `Unanswerable Handling: ${unanswerableRate}`,
    );
}

function calculateRate(
    passed: number,
    total: number,
): string {
    if (total === 0) {
        return 'N/A';
    }

    return (
        (
            passed /
            total *
            100
        ).toFixed(1) +
        '%'
    );
}

async function saveResults(
    results: AnswerEvalResult[],
): Promise<void> {
    await mkdir(
        dirname(OUTPUT_PATH),
        {
            recursive: true,
        },
    );

    await writeFile(
        OUTPUT_PATH,
        JSON.stringify(
            {
                createdAt:
                    new Date().toISOString(),
                source:
                    INPUT_PATH,
                results,
            },
            null,
            2,
        ),
        'utf8',
    );

    console.log(
        `Answer eval results saved: ${OUTPUT_PATH}`,
    );
}

function getRequiredEnv(
    name: string,
): string {
    const value =
        process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} is required.`,
        );
    }

    return value;
}

function getAnswerable(
    name: string,
): boolean {
    const testCase =
        RAG_RETRIEVAL_EVAL_CASES.find(
            (testCase) =>
                testCase.name === name,
        );

    if (!testCase) {
        throw new Error(
            `Unknown RAG eval case: ${name}`,
        );
    }

    return (
        testCase.answerable ??
        !testCase.negative
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });