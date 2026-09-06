import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

import { AnalysisClientService } from '../src/analysis/analysis-client.service';
import { AgentGraphFactory } from '../src/agent/agent-graph.factory';
import { AgentToolsService } from '../src/agent/agent-tools.service';
import { RagAnswerService } from '../src/rag/rag-answer.service';
import { RagSearchService } from '../src/rag/rag-search.service';
import { UserMemoryToolsService } from '../src/user-memory/user-memory-tools.service';
import { PrismaService } from '../src/prisma/prisma.service';

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

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.OPENAI_MODEL;

    if (!apiKey || !modelName) {
        throw new Error('OPENAI_API_KEY 또는 OPENAI_MODEL이 없습니다.');
    }

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
        getSpendingTrend: async () => {
            selectedTools.push('get_expense_trend');

            return {
                granularity: 'month' as const,
                points: [],
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

    const model = new ChatOpenAI({
        apiKey,
        model: modelName,
        reasoning: {
            effort: 'low',
        },
    });

    const graph = factory.createGraph(model, tools, {
        userId: 1,
    });

    let failedCount = 0;

    for (const [index, evalCase] of evalCases.entries()) {
        selectedTools.length = 0;

        await graph.invoke(
            {
                messages: [
                    new HumanMessage(evalCase.question),
                ],
            },
            {
                configurable: {
                    thread_id: `analysis-tool-eval-${index}-${Date.now()}`,
                },
            },
        );

        const selectedTool = selectedTools[0] ?? 'none';
        const passed =
            selectedTools.length === 1
            && selectedTool === evalCase.expectedTool;

        if (!passed) {
            failedCount += 1;
        }

        console.log({
            question: evalCase.question,
            expected: evalCase.expectedTool,
            selected: selectedTools,
            passed,
        });
    }

    if (failedCount > 0) {
        throw new Error(
            `${failedCount}/${evalCases.length}개 Tool 선택 평가 실패`,
        );
    }

    console.log(
        `ALL_ANALYSIS_TOOL_SELECTION_EVALS_PASSED (${evalCases.length}/${evalCases.length})`,
    );
}

void main();
