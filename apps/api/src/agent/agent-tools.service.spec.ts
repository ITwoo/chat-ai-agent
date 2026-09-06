import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentToolsService } from '../agent/agent-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserMemoryToolsService } from '../user-memory/user-memory-tools.service';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import {
    Command,
    END,
    MemorySaver,
    MessagesValue,
    START,
    StateGraph,
    StateSchema,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AnalysisClientService } from '../analysis/analysis-client.service';

const expense = {
    id: 1,
    amount: 8500,
    category: '식비',
    title: '편의점',
    memo: null,
    spentAt: new Date('2026-08-10T12:00:00+09:00'),
    version: 1,
};

describe('AgentToolsService', () => {
    let service: AgentToolsService;

    const createMany = jest
        .fn<() => Promise<{ count: number }>>()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

    const findUniqueOrThrow = jest
        .fn<() => Promise<typeof expense>>()
        .mockResolvedValue(expense);


    const findExpense = jest.fn<
        () => Promise<typeof expense | null>
    >();

    const claimUpdateOperation = jest.fn<
        () => Promise<{ count: number }>
    >();

    const updateExpense = jest.fn<
        () => Promise<{ count: number }>
    >();

    const deleteUpdateOperation = jest.fn<
        () => Promise<object>
    >();

    const findCurrentExpense = jest.fn<
        () => Promise<{ version: number } | null>
    >();

    type TransactionMock = {
        expense: {
            createMany: typeof createMany;
            findUniqueOrThrow: typeof findUniqueOrThrow;
            updateMany: typeof updateExpense;
            findFirst: typeof findCurrentExpense;
        };
        expenseUpdateOperation: {
            createMany: typeof claimUpdateOperation;
            delete: typeof deleteUpdateOperation;
        };
    };

    const prisma = {
        expense: {
            findFirst: findExpense,
        },

        $transaction: async <T>(
            callback: (tx: TransactionMock) => Promise<T>,
        ): Promise<T> => {
            return callback({
                expense: {
                    createMany,
                    findUniqueOrThrow,
                    updateMany: updateExpense,
                    findFirst: findCurrentExpense,
                },
                expenseUpdateOperation: {
                    createMany: claimUpdateOperation,
                    delete: deleteUpdateOperation,
                },
            });
        },
    };

    const userMemoryToolsService = {
        getTools: jest.fn<() => []>().mockReturnValue([]),
    };

    const getSpendingSummary = jest
        .fn<AnalysisClientService['getSpendingSummary']>()
        .mockResolvedValue({
            totalAmount: 80000,
            count: 3,
            averageAmount: 26666.67,
            topCategory: '식비',
            categories: [
                {
                    category: '식비',
                    amount: 80000,
                    count: 3,
                    percentage: 100,
                },
            ],
        });

    const getSpendingComparison = jest
        .fn<AnalysisClientService['getSpendingComparison']>()
        .mockResolvedValue({
            currentTotalAmount: 500000,
            previousTotalAmount: 400000,
            difference: 100000,
            changeRate: 25,
            categories: [
                {
                    category: '식비',
                    currentAmount: 200000,
                    previousAmount: 150000,
                    difference: 50000,
                    changeRate: 33.3,
                },
            ],
        });

    const getSpendingTrend = jest
        .fn<AnalysisClientService['getSpendingTrend']>()
        .mockResolvedValue({
            granularity: 'day',
            points: [
                {
                    period: '2026-08-01T00:00:00',
                    amount: 30000,
                    count: 2,
                    changeRate: null,
                    movingAverage: 30000,
                },
            ],
        });

    const getSpendingAnomalies = jest
        .fn<AnalysisClientService['getSpendingAnomalies']>()
        .mockResolvedValue({
            threshold: 2,
            anomalies: [
                {
                    id: 10,
                    title: '파인다이닝',
                    category: '식비',
                    amount: 100000,
                    spentAt: '2026-08-10T10:00:00Z',
                    categoryAverage: 11500,
                    zScore: 79.16,
                },
            ],
        });

    const getSpendingForecast = jest
        .fn<AnalysisClientService['getSpendingForecast']>()
        .mockResolvedValue({
            currentAmount: 285000,
            forecastAmount: 900000,
            dailyAverage: 30000,
            daysInMonth: 30,
            elapsedDays: 9.5,
            remainingDays: 20.5,
            method: 'daily_average',
        });

    const analysisClient = {
        getSpendingSummary,
        getSpendingComparison,
        getSpendingTrend,
        getSpendingAnomalies,
        getSpendingForecast,
    };

    beforeEach(async () => {
        getSpendingSummary.mockClear();
        getSpendingComparison.mockClear();
        getSpendingTrend.mockClear();
        getSpendingAnomalies.mockClear();
        getSpendingForecast.mockClear();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AgentToolsService,
                {
                    provide: PrismaService,
                    useValue: prisma,
                },
                {
                    provide: UserMemoryToolsService,
                    useValue: userMemoryToolsService,
                },
                {
                    provide: AnalysisClientService,
                    useValue: analysisClient,
                },
            ],
        }).compile();

        service = module.get<AgentToolsService>(
            AgentToolsService,
        );
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('동일한 create_expense Tool Call 재실행 시 중복으로 처리한다', async () => {
        const tools = service.getTools({
            userId: 1,
        });

        const createExpenseTool = tools.find(
            (tool) => tool.name === 'create_expense',
        );

        expect(createExpenseTool).toBeDefined();

        const toolCall = {
            type: 'tool_call' as const,
            id: 'tool-call-1',
            name: 'create_expense',
            args: {
                amount: 8500,
                category: '식비',
                title: '편의점',
                spentAt: '2026-08-10T12:00:00+09:00',
            },
        };

        const toolNode = new ToolNode([
            createExpenseTool!,
        ]);

        const state = {
            messages: [
                new AIMessage({
                    content: '',
                    tool_calls: [toolCall],
                }),
            ],
        };

        const config = {
            configurable: {
                thread_id: 'thread-1',
            },
        };

        const firstResult = await toolNode.invoke(
            state,
            config,
        );

        const secondResult = await toolNode.invoke(
            state,
            config,
        );

        const firstMessage = firstResult.messages?.[0];
        const secondMessage = secondResult.messages?.[0];

        expect(ToolMessage.isInstance(firstMessage)).toBe(true);
        expect(ToolMessage.isInstance(secondMessage)).toBe(true);

        expect(firstMessage?.content).toContain(
            '"duplicated":false',
        );

        expect(secondMessage?.content).toContain(
            '"duplicated":true',
        );

    });

    it('승인 대기 중 version이 변경되면 오래된 승인을 거부한다', async () => {
        findExpense
            .mockResolvedValueOnce({
                ...expense,
                version: 1,
            })
            .mockResolvedValueOnce({
                ...expense,
                amount: 9000,
                version: 2,
            });

        claimUpdateOperation.mockResolvedValue({
            count: 1,
        });

        updateExpense.mockResolvedValue({
            count: 0,
        });

        deleteUpdateOperation.mockResolvedValue({});

        findCurrentExpense.mockResolvedValue({
            version: 2,
        });

        const tools = service.getTools({
            userId: 1,
        });

        const updateExpenseTool = tools.find(
            (tool) => tool.name === 'update_expense',
        );

        expect(updateExpenseTool).toBeDefined();

        const toolNode = new ToolNode([
            updateExpenseTool!,
        ]);

        const TestState = new StateSchema({
            messages: MessagesValue,
        });

        const graph = new StateGraph(TestState)
            .addNode('tools', toolNode)
            .addEdge(START, 'tools')
            .addEdge('tools', END)
            .compile({
                checkpointer: new MemorySaver(),
            });

        const config = {
            configurable: {
                thread_id: 'stale-approval-thread',
            },
        };

        const toolCall = {
            type: 'tool_call' as const,
            id: 'update-tool-call-1',
            name: 'update_expense',
            args: {
                expenseId: 1,
                amount: 9500,
            },
        };

        await graph.invoke(
            {
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [toolCall],
                    }),
                ],
            },
            config,
        );

        const result = await graph.invoke(
            new Command({
                resume: {
                    action: 'approve',
                    expectedVersion: 1,
                },
            }),
            config,
        );

        const resultMessage = result.messages.at(-1);

        expect(
            ToolMessage.isInstance(resultMessage),
        ).toBe(true);

        if (!ToolMessage.isInstance(resultMessage)) {
            throw new Error(
                'update_expense 결과가 ToolMessage가 아닙니다.',
            );
        }

        expect(resultMessage.content).toContain(
            '"status":"stale_approval"',
        );

        expect(resultMessage.content).toContain(
            '"expectedVersion":1',
        );

        expect(resultMessage.content).toContain(
            '"currentVersion":2',
        );
    });

    it('get_expense_summary는 Analysis Service에서 지출 요약을 조회한다', async () => {
        const tools = service.getTools({
            userId: 1,
        });

        const expenseSummaryTool = tools.find(
            (tool) => tool.name === 'get_expense_summary',
        );

        expect(expenseSummaryTool).toBeDefined();

        const result = await expenseSummaryTool!.invoke({
            startDate: '2026-08-01T00:00:00+09:00',
            endDate: '2026-09-01T00:00:00+09:00',
            category: '식비',
        });

        expect(getSpendingSummary).toHaveBeenCalledWith({
            userId: 1,
            startDate: '2026-07-31T15:00:00.000Z',
            endDate: '2026-08-31T15:00:00.000Z',
            category: '식비',
        });

        expect(JSON.parse(result as string)).toEqual({
            totalAmount: 80000,
            count: 3,
            categorySummary: {
                식비: 80000,
            },
            startDate: '2026-07-31T15:00:00.000Z',
            endDate: '2026-08-31T15:00:00.000Z',
            category: '식비',
        });
    });

    it('get_expense_comparison은 Analysis Service에서 두 기간의 지출을 비교한다', async () => {
        const tools = service.getTools({ userId: 1 });
        const comparisonTool = tools.find((tool) => tool.name === 'get_expense_comparison');

        expect(comparisonTool).toBeDefined();

        const result = await comparisonTool!.invoke({
            currentStartDate: '2026-09-01T00:00:00+09:00',
            currentEndDate: '2026-10-01T00:00:00+09:00',
            previousStartDate: '2026-08-01T00:00:00+09:00',
            previousEndDate: '2026-09-01T00:00:00+09:00',
        });

        expect(getSpendingComparison).toHaveBeenCalledWith({
            userId: 1,
            currentStartDate: '2026-08-31T15:00:00.000Z',
            currentEndDate: '2026-09-30T15:00:00.000Z',
            previousStartDate: '2026-07-31T15:00:00.000Z',
            previousEndDate: '2026-08-31T15:00:00.000Z',
        });

        expect(JSON.parse(result as string)).toEqual({
            currentTotalAmount: 500000,
            previousTotalAmount: 400000,
            difference: 100000,
            changeRate: 25,
            categories: [
                {
                    category: '식비',
                    currentAmount: 200000,
                    previousAmount: 150000,
                    difference: 50000,
                    changeRate: 33.3,
                },
            ],
        });
    });

    it('get_expense_trend는 Analysis Service에서 지출 추세를 조회한다', async () => {
        const tools = service.getTools({ userId: 1 });
        const trendTool = tools.find((tool) => tool.name === 'get_expense_trend');

        expect(trendTool).toBeDefined();

        const result = await trendTool!.invoke({
            startDate: '2026-08-01T00:00:00+09:00',
            endDate: '2026-09-01T00:00:00+09:00',
            category: '식비',
            granularity: 'day',
        });

        expect(getSpendingTrend).toHaveBeenCalledWith({
            userId: 1,
            startDate: '2026-07-31T15:00:00.000Z',
            endDate: '2026-08-31T15:00:00.000Z',
            category: '식비',
            granularity: 'day',
        });

        expect(JSON.parse(result as string)).toEqual({
            granularity: 'day',
            points: [
                {
                    period: '2026-08-01T00:00:00',
                    amount: 30000,
                    count: 2,
                    changeRate: null,
                    movingAverage: 30000,
                },
            ],
        });
    });

    it('get_expense_anomalies는 Analysis Service에서 이상 소비를 조회한다', async () => {
        const tools = service.getTools({ userId: 1 });
        const anomalyTool = tools.find((tool) => tool.name === 'get_expense_anomalies');

        expect(anomalyTool).toBeDefined();

        const result = await anomalyTool!.invoke({
            startDate: '2026-08-01T00:00:00+09:00',
            endDate: '2026-09-01T00:00:00+09:00',
            category: '식비',
            threshold: 2,
        });

        expect(getSpendingAnomalies).toHaveBeenCalledWith({
            userId: 1,
            startDate: '2026-07-31T15:00:00.000Z',
            endDate: '2026-08-31T15:00:00.000Z',
            category: '식비',
            threshold: 2,
        });

        expect(JSON.parse(result as string)).toEqual({
            threshold: 2,
            anomalies: [
                {
                    id: 10,
                    title: '파인다이닝',
                    category: '식비',
                    amount: 100000,
                    spentAt: '2026-08-10T10:00:00Z',
                    categoryAverage: 11500,
                    zScore: 79.16,
                },
            ],
        });
    });

    it('get_expense_forecast는 Analysis Service에서 월말 예상 지출을 조회한다', async () => {
        const tools = service.getTools({ userId: 1 });
        const forecastTool = tools.find((tool) => tool.name === 'get_expense_forecast');

        expect(forecastTool).toBeDefined();

        const result = await forecastTool!.invoke({
            asOfDate: '2026-09-10T12:00:00+09:00',
        });

        expect(getSpendingForecast).toHaveBeenCalledWith({
            userId: 1,
            asOfDate: '2026-09-10T03:00:00.000Z',
        });

        expect(JSON.parse(result as string)).toEqual({
            currentAmount: 285000,
            forecastAmount: 900000,
            dailyAverage: 30000,
            daysInMonth: 30,
            elapsedDays: 9.5,
            remainingDays: 20.5,
            method: 'daily_average',
        });
    });

});
