import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';

import { AnalysisClientService } from '../src/analysis/analysis-client.service';
import { AgentGraphFactory } from '../src/agent/agent-graph.factory';
import { AgentToolsService } from '../src/agent/agent-tools.service';
import { RagAnswerService } from '../src/rag/rag-answer.service';
import { RagSearchService } from '../src/rag/rag-search.service';
import { UserMemoryToolsService } from '../src/user-memory/user-memory-tools.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LlmModelFactory } from '../src/llm/llm-model.factory';
import { LLM_PROVIDERS } from '../src/llm/llm-provider.type';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';

const ANALYSIS_TOOL_NAMES = new Set([
    'get_expense_summary',
    'get_expense_comparison',
    'get_expense_trend',
    'get_expense_anomalies',
    'get_expense_forecast',
]);

const evalCases = [
    {
        question: '이번 달 지금까지 총 얼마 썼어?',
        expectedTool: 'get_expense_summary',
    },
    {
        question: '이번 달이 지난달보다 얼마나 더 썼어?',
        expectedTool: 'get_expense_comparison',
    },
    {
        question: '최근 6개월 월별 소비 추세 보여줘.',
        expectedTool: 'get_expense_trend',
    },
    {
        question: '최근 한 달 동안 평소보다 비정상적으로 큰 지출이 있었어?',
        expectedTool: 'get_expense_anomalies',
    },
    {
        question: '이대로 쓰면 이번 달 말까지 얼마 정도 쓸 것 같아?',
        expectedTool: 'get_expense_forecast',
    },
] as const;

type AnalysisToolEvalResult = {
    provider: (typeof LLM_PROVIDERS)[number];
    question: string;
    expectedTool: string;
    selectedTools: string[];
    latencyMs: number;
    passed: boolean;
};

async function main() {

    const selectedTools: string[] = [];

    const analysisClient = {
        getSpendingSummary: async () => {
            selectedTools.push('get_expense_summary');

            return {
                totalAmount: 100000,
                count: 5,
                averageAmount: 20000,
                topCategory: '식비',
                categories: [],
            };
        },
        getSpendingComparison: async () => {
            selectedTools.push('get_expense_comparison');

            return {
                currentTotalAmount: 100000,
                previousTotalAmount: 80000,
                difference: 20000,
                changeRate: 25,
                categories: [],
            };
        },
        getSpendingTrend: async (
            request: Parameters<
                AnalysisClientService['getSpendingTrend']
            >[0],
        ) => {
            selectedTools.push('get_expense_trend');

            return {
                granularity: 'month' as const,
                points: [
                    {
                        period: '2026-04-01T00:00:00',
                        amount: 100000,
                        count: 5,
                        changeRate: null,
                        movingAverage: 100000,
                    },
                    {
                        period: '2026-05-01T00:00:00',
                        amount: 120000,
                        count: 6,
                        changeRate: 20,
                        movingAverage: 110000,
                    },
                    {
                        period: '2026-06-01T00:00:00',
                        amount: 110000,
                        count: 5,
                        changeRate: -8.33,
                        movingAverage: 110000,
                    },
                    {
                        period: '2026-07-01T00:00:00',
                        amount: 140000,
                        count: 7,
                        changeRate: 27.27,
                        movingAverage: 123333,
                    },
                    {
                        period: '2026-08-01T00:00:00',
                        amount: 130000,
                        count: 6,
                        changeRate: -7.14,
                        movingAverage: 126667,
                    },
                    {
                        period: '2026-09-01T00:00:00',
                        amount: 150000,
                        count: 8,
                        changeRate: 15.38,
                        movingAverage: 140000,
                    },
                ],
            };
        },
        getSpendingAnomalies: async () => {
            selectedTools.push('get_expense_anomalies');

            return {
                threshold: 2,
                anomalies: [],
            };
        },
        getSpendingForecast: async () => {
            selectedTools.push('get_expense_forecast');

            return {
                currentAmount: 100000,
                forecastAmount: 300000,
                dailyAverage: 10000,
                daysInMonth: 30,
                elapsedDays: 10,
                remainingDays: 20,
                method: 'daily_average' as const,
            };
        },
    };

    const toolsService = new AgentToolsService(
        {} as PrismaService,
        {
            getTools: () => [],
        } as unknown as UserMemoryToolsService,
        analysisClient as unknown as AnalysisClientService,
    );

    const tools = toolsService
        .getTools({ userId: 1 })
        .filter((tool) => ANALYSIS_TOOL_NAMES.has(tool.name));

    const factory = new AgentGraphFactory(
        {} as never,
        {} as RagSearchService,
        {} as RagAnswerService,
    );

    Object.assign(factory, {
        checkpointer: new MemorySaver(),
    });

    const configService = new ConfigService(process.env);

    const llmModelFactory = new LlmModelFactory(
        configService,
    );

    let totalFailedCount = 0;

    const results: AnalysisToolEvalResult[] = [];

    for (const provider of LLM_PROVIDERS) {
        const model = llmModelFactory.createModel(provider);

        const graph = factory.createGraph(model, tools, {
            userId: 1,
        });

        let providerFailedCount = 0;

        console.log(`\n=== ${provider.toUpperCase()} ===`);

        for (const [index, evalCase] of evalCases.entries()) {
            selectedTools.length = 0;

            const startedAt = performance.now();

            await graph.invoke(
                {
                    messages: [
                        new HumanMessage(evalCase.question),
                    ],
                },
                {
                    configurable: {
                        thread_id:
                            `analysis-tool-eval-${provider}-${index}-${Date.now()}`,
                    },
                },
            );

            const latencyMs = Math.round(
                performance.now() - startedAt,
            );

            const selectedTool = selectedTools[0] ?? 'none';
            const passed =
                selectedTools.length === 1
                && selectedTool === evalCase.expectedTool;

            if (!passed) {
                providerFailedCount += 1;
                totalFailedCount += 1;
            }

            results.push({
                provider,
                question: evalCase.question,
                expectedTool: evalCase.expectedTool,
                selectedTools: [...selectedTools],
                latencyMs,
                passed,
            });

            console.log({
                provider,
                question: evalCase.question,
                expected: evalCase.expectedTool,
                selected: selectedTools,
                passed,
            });
        }

        console.log(
            `${provider}: ${evalCases.length - providerFailedCount}/${evalCases.length} passed`,
        );
    }

    await saveResults(results);

    if (totalFailedCount > 0) {
        throw new Error(
            `총 ${totalFailedCount}/${LLM_PROVIDERS.length * evalCases.length}개 Tool 선택 평가 실패`,
        );
    }

    console.log(
        `ALL_MULTI_LLM_ANALYSIS_TOOL_EVALS_PASSED (${LLM_PROVIDERS.length * evalCases.length}/${LLM_PROVIDERS.length * evalCases.length})`,
    );
}

async function saveResults(
    results: AnalysisToolEvalResult[],
): Promise<void> {
    const createdAt = new Date().toISOString();

    const outputDirectory = resolve(
        process.cwd(),
        'eval-results',
    );

    const fileName =
        `agent-analysis-tool-${createdAt.replace(/[:.]/g, '-')}.json`;

    const outputPath = resolve(
        outputDirectory,
        fileName,
    );

    const providerResults = Object.fromEntries(
        LLM_PROVIDERS.map((provider) => {
            const resultsByProvider = results.filter(
                (result) => result.provider === provider,
            );

            const passed = resultsByProvider.filter(
                (result) => result.passed,
            ).length;

            const averageLatencyMs =
                resultsByProvider.length === 0
                    ? 0
                    : Math.round(
                        resultsByProvider.reduce(
                            (total, result) =>
                                total + result.latencyMs,
                            0,
                        ) / resultsByProvider.length,
                    );
                    
            return [
                provider,
                {
                    total: resultsByProvider.length,
                    passed,
                    failed:
                        resultsByProvider.length - passed,
                    averageLatencyMs,
                },
            ];
        }),
    );

    await mkdir(outputDirectory, {
        recursive: true,
    });

    await writeFile(
        outputPath,
        JSON.stringify(
            {
                createdAt,
                total: results.length,
                passed: results.filter(
                    (result) => result.passed,
                ).length,
                failed: results.filter(
                    (result) => !result.passed,
                ).length,
                providers: providerResults,
                results,
            },
            null,
            2,
        ),
        'utf8',
    );

    console.log(
        `Eval results saved: ${outputPath}`,
    );
}

void main();
