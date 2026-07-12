import { Injectable, Logger } from '@nestjs/common';
import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

type AgentToolContext = {
    userId: number;
}

const EXPENSE_CATEGORIES = [
    '식비',
    '교통',
    '주거',
    '공과금',
    '통신',
    '생활용품',
    '쇼핑',
    '의료',
    '문화여가',
    '운동',
    '교육',
    '경조사',
    '기타',
] as const;

const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);

@Injectable()
export class AgentToolsService {
    private readonly logger = new Logger(AgentToolsService.name);

    constructor(private readonly prisma: PrismaService){}

    getTools(context: AgentToolContext): StructuredToolInterface[] {
        return [
            this.createGetCurrentDateTimeTool(),
            this.createExpenseTool(context),
            this.createExpenseSummaryTool(context),
        ];
    }

    private createGetCurrentDateTimeTool() {
        return tool(
            async () => {
                this.logger.log('[tool] get_current_date_time');

                return new Date().toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    weekday: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });
            },
            {
                name: 'get_current_date_time',
                description:
                    '현재 날짜와 시간을 Asia/Seoul 기준으로 반환한다. 오늘, 이번 달, 이번 주처럼 현재 시점 판단이 필요할 때 사용한다.',
                schema: z.object({}),
            },
        );
    }

    private createExpenseTool(context: AgentToolContext) {
        return tool(
            async ({ amount, category, title, memo, spentAt }) => {
                this.logger.log('[total create_expense');

                const parsedSpentAt = new Date(spentAt);

                if(Number.isNaN(parsedSpentAt.getTime())) {
                    return '지출 날짜 형식이 올바르지 않습니다. spentAt은 ISO 날짜 문자열이어야 합니다.';
                }

                const expense = await this.prisma.expense.create({
                    data: {
                        userId: context.userId,
                        amount,
                        category,
                        title,
                        memo,
                        spentAt: parsedSpentAt,
                    },
                });

                return JSON.stringify({
                    id: expense.id,
                    amount: expense.amount,
                    category: expense.category,
                    title: expense.title,
                    memo: expense.memo,
                    spentAt: expense.spentAt.toISOString(),
                    message: '지출 기록을 저장했습니다.',
                });
            },
            {
                name: 'create_expense',
                description: '사용자의 지출 기록을 저장한다. 사용자가 돈을 썻다고 말하면 금액, 카테고리, 제목, 메모, 지출 날짜를 정리해서 호출한다.',
                schema: z.object({
                    amount: z
                        .number()
                        .int()
                        .positive()
                        .describe('지출 금액. 원화 기준 숫자만 입력한다. 예: 8500'),
                    category: z
                        .string()
                        .min(1)
                        .describe('지출 카테고리. 반드시 정해진 카테고리 중 하나를 선택한다.'),
                    title: z
                        .string()
                        .min(1)
                        .describe('지출 제목. 예: 편의점, 점심, 쿠팡, 전기요금'),
                    memo: z
                        .string()
                        .optional()
                        .describe('선택 메모. 사용자가 말한 추가 설명이 있으면 넣는다.'),
                    spentAt: z
                        .string()
                        .describe('실제 지출한 날짜와 시간. ISO 8601 문자열로 입력한다. 예: 2026-07-09T14:30:00+09:00'),
                }),
            },
        );
    }

    private createExpenseSummaryTool (context: AgentToolContext) {
        return tool(
            async({ startDate, endDate, category }) => {
                this.logger.log('[tool] get_expense_summary');

                const parsedStartDate = new Date(startDate);
                const parsedEndDate = new Date(endDate);

                if(Number.isNaN(parsedStartDate.getTime())) {
                    return '조회 시작 날짜 형식이 올바르지 않습니다. startDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if(Number.isNaN(parsedEndDate.getTime())) {
                    return '조회 종료 날짜 형식이 올바르지 않습니다. endDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if(parsedStartDate >= parsedEndDate) {
                    return '조회 시작 날짜는 종료 날짜보다 이전이어야 합니다.';
                }

                const expenses = await this.prisma.expense.findMany({
                    where: {
                        userId: context.userId,
                        spentAt: {
                            gte: parsedStartDate,
                            lt: parsedEndDate
                        },
                        ...(category
                            ? {
                                category,
                            }
                            : {}),
                    },
                    orderBy: {
                        spentAt: 'asc',
                    },
                });

                const totalAmount = expenses.reduce(
                    (sum, expenses) => sum + expenses.amount,
                    0
                );

                const categorySummary = expenses.reduce<Record<string, number>>(
                    (summary, expense) => {
                        summary[expense.category] = (summary[expense.category] ?? 0 ) + expense.amount;

                        return summary;
                    },
                    {},
                );

                return JSON.stringify({
                    totalAmount,
                    count: expenses.length,
                    categorySummary,
                    startDate: parsedStartDate.toISOString(),
                    endDate: parsedEndDate.toISOString(),
                    category: category ?? null,
                });
            },
            {
                name: 'get_expense_summary',
                description: '사용자의 지출 기록을 기간 기준으로 조회하고 총액과 카테고리별 합계를 반환한다. 이번 달 지출, 이번 주 식비, 최근 7일 소비처럼 지출 요약이 필요할 때 사용한다.',
                schema: z.object({
                    startDate: z
                        .string()
                        .describe('조회 시작 날짜. ISO 8601 문자열로 입력한다. 예: 2026-07-01T00:00:00+09:00'),
                    endDate: z
                        .string()
                        .describe('조회 종료 날짜. ISO 8601 문자열로 입력한다. 이 날짜는 포함하지 않는다. 예: 2026-08-01T00:00:00+09:00'),
                    category: z
                        .string()
                        .optional()
                        .describe('선택 카테고리. 특정 카테고리만 조회할 때 사용한다.'),
                }),
            },
        );
    }
    
}