import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { AnalysisClientService } from '../analysis/analysis-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserMemoryToolsService } from '../user-memory/user-memory-tools.service';

import { AgentToolsService } from './agent-tools.service';

const integrationDescribe =
    process.env.RUN_ANALYSIS_INTEGRATION === 'true'
        ? describe
        : describe.skip;

integrationDescribe(
    'AgentToolsService Analysis Integration',
    () => {
        const configService = {
            getOrThrow: jest
                .fn()
                .mockReturnValue('http://localhost:8001'),
        };

        const analysisClient = new AnalysisClientService(
            configService as unknown as ConfigService,
        );

        const prisma = {} as PrismaService;

        const userMemoryToolsService = {
            getTools: jest.fn().mockReturnValue([]),
        } as unknown as UserMemoryToolsService;

        const service = new AgentToolsService(
            prisma,
            userMemoryToolsService,
            analysisClient,
        );

        it('get_expense_summary가 실제 Analysis Service를 호출한다', async () => {
            const tools = service.getTools({
                userId: 1,
            });

            const expenseSummaryTool = tools.find(
                (tool) => tool.name === 'get_expense_summary',
            );

            expect(expenseSummaryTool).toBeDefined();

            const result = await expenseSummaryTool!.invoke({
                startDate: '2020-01-01T00:00:00+09:00',
                endDate: '2030-01-01T00:00:00+09:00',
            });

            const parsed = JSON.parse(result as string);

            expect(parsed).toEqual(
                expect.objectContaining({
                    totalAmount: expect.any(Number),
                    count: expect.any(Number),
                    categorySummary: expect.any(Object),
                    category: null,
                }),
            );
        });

        it('get_expense_comparison이 실제 Analysis Service를 호출한다', async () => {
            const tools = service.getTools({ userId: 1 });
            const comparisonTool = tools.find((tool) => tool.name === 'get_expense_comparison');

            expect(comparisonTool).toBeDefined();

            const result = await comparisonTool!.invoke({
                currentStartDate: '2026-08-01T00:00:00+09:00',
                currentEndDate: '2026-09-01T00:00:00+09:00',
                previousStartDate: '2026-07-01T00:00:00+09:00',
                previousEndDate: '2026-08-01T00:00:00+09:00',
            });

            const parsed = JSON.parse(result as string);

            expect(parsed).toEqual(
                expect.objectContaining({
                    currentTotalAmount: expect.any(Number),
                    previousTotalAmount: expect.any(Number),
                    difference: expect.any(Number),
                    categories: expect.any(Array),
                }),
            );

            expect(parsed.changeRate === null || typeof parsed.changeRate === 'number').toBe(true);
        });

        it('get_expense_trend가 실제 Analysis Service를 호출한다', async () => {
            const tools = service.getTools({ userId: 1 });
            const trendTool = tools.find((tool) => tool.name === 'get_expense_trend');

            expect(trendTool).toBeDefined();

            const result = await trendTool!.invoke({
                startDate: '2026-07-01T00:00:00+09:00',
                endDate: '2026-09-01T00:00:00+09:00',
                granularity: 'month',
            });

            const parsed = JSON.parse(result as string);

            expect(parsed.granularity).toBe('month');
            expect(parsed.points).toBeInstanceOf(Array);

            for (const point of parsed.points) {
                expect(point).toEqual(
                    expect.objectContaining({
                        period: expect.any(String),
                        amount: expect.any(Number),
                        count: expect.any(Number),
                        movingAverage: expect.any(Number),
                    }),
                );

                expect(point.changeRate === null || typeof point.changeRate === 'number').toBe(true);
            }
        });

        it('get_expense_anomalies가 실제 Analysis Service를 호출한다', async () => {
            const tools = service.getTools({ userId: 1 });
            const anomalyTool = tools.find((tool) => tool.name === 'get_expense_anomalies');

            expect(anomalyTool).toBeDefined();

            const result = await anomalyTool!.invoke({
                startDate: '2020-01-01T00:00:00+09:00',
                endDate: '2030-01-01T00:00:00+09:00',
            });

            const parsed = JSON.parse(result as string);

            expect(parsed.threshold).toEqual(expect.any(Number));
            expect(parsed.anomalies).toBeInstanceOf(Array);

            for (const anomaly of parsed.anomalies) {
                expect(anomaly).toEqual(
                    expect.objectContaining({
                        id: expect.any(Number),
                        title: expect.any(String),
                        category: expect.any(String),
                        amount: expect.any(Number),
                        spentAt: expect.any(String),
                        categoryAverage: expect.any(Number),
                    }),
                );

                expect(anomaly.zScore === null || typeof anomaly.zScore === 'number').toBe(true);
            }
        });

        it('get_expense_forecast가 실제 Analysis Service를 호출한다', async () => {
            const tools = service.getTools({ userId: 1 });
            const forecastTool = tools.find((tool) => tool.name === 'get_expense_forecast');

            expect(forecastTool).toBeDefined();

            const result = await forecastTool!.invoke({
                asOfDate: new Date().toISOString(),
            });

            const parsed = JSON.parse(result as string);

            expect(parsed).toEqual(
                expect.objectContaining({
                    currentAmount: expect.any(Number),
                    forecastAmount: expect.any(Number),
                    dailyAverage: expect.any(Number),
                    daysInMonth: expect.any(Number),
                    elapsedDays: expect.any(Number),
                    remainingDays: expect.any(Number),
                    method: 'daily_average',
                }),
            );
        });
    },
);