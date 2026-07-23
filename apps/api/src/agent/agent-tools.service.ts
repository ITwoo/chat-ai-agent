import { Injectable, Logger } from '@nestjs/common';
import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { interrupt } from '@langchain/langgraph';
import { ExpenseUpdateApprovalRequest, updateExpenseDecisionSchema } from './agent-interrupt.schema';
import { RagSearchService } from '../rag/rag-search.service';

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

    constructor(
        private readonly prisma: PrismaService,
        private readonly ragSearchService: RagSearchService,
    ) { }

    getTools(context: AgentToolContext): StructuredToolInterface[] {
        return [
            this.createGetCurrentDateTimeTool(),
            this.createExpenseTool(context),
            this.createExpenseSummaryTool(context),
            this.createExpenseListTool(context),
            this.createFindExpensesTool(context),
            this.createUpdateExpenseTool(context),
            this.createSearchRagDocumentsTool(context),
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
                    '현재 날짜와 시간을 Asia/Seoul 기준으로 반환한다. 오늘, 어제, 이번 주, 이번 달처럼 상대적인 날짜나 기간을 계산할 때 사용한다. 사용자가 절대 날짜를 명확하게 지정했다면 불필요하게 호출하지 않는다.',
                schema: z.object({}),
            },
        );
    }

    private createExpenseTool(context: AgentToolContext) {
        return tool(
            async ({ amount, category, title, memo, spentAt }) => {
                this.logger.log('[tool] create_expense');

                const parsedSpentAt = new Date(spentAt);

                if (Number.isNaN(parsedSpentAt.getTime())) {
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
                description:
                    '새로운 지출 기록을 저장한다. 사용자가 실제로 돈을 썼다고 말하거나 지출을 기록해 달라고 요청할 때 사용한다. 한 요청에 여러 지출이 포함되어 있으면 각 지출마다 이 tool을 각각 호출한다. 기존 지출의 조회, 수정 또는 삭제에는 사용하지 않는다.',
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

    private createExpenseSummaryTool(context: AgentToolContext) {
        return tool(
            async ({ startDate, endDate, category }) => {
                this.logger.log('[tool] get_expense_summary');

                const parsedStartDate = new Date(startDate);
                const parsedEndDate = new Date(endDate);

                if (Number.isNaN(parsedStartDate.getTime())) {
                    return '조회 시작 날짜 형식이 올바르지 않습니다. startDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if (Number.isNaN(parsedEndDate.getTime())) {
                    return '조회 종료 날짜 형식이 올바르지 않습니다. endDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if (parsedStartDate >= parsedEndDate) {
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
                        summary[expense.category] = (summary[expense.category] ?? 0) + expense.amount;

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
                description:
                    '사용자의 지출 총액, 지출 건수와 카테고리별 합계를 기간 기준으로 계산한다. 이번 달 총지출, 이번 주 식비 합계, 최근 소비 요약처럼 집계 결과가 필요할 때 사용한다. 개별 지출 항목 목록을 보여주거나 수정·삭제할 대상을 찾는 용도로는 사용하지 않는다.',
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

    private createExpenseListTool(context: AgentToolContext) {
        return tool(
            async ({
                startDate,
                endDate,
                category,
                limit = 10,
            }) => {
                this.logger.log('[tool] get_expense_list');

                const parsedStartDate = startDate ? new Date(startDate) : undefined;
                const parsedEndDate = endDate ? new Date(endDate) : undefined;

                if (parsedStartDate && Number.isNaN(parsedStartDate.getTime())) {
                    return '조회 시작 날짜 형식이 올바르지 않습니다. startDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
                    return '조회 종료 날짜 형식이 올바르지 않습니다. endDate는 ISO 날짜 문자열이어야 합니다.';
                }

                const where: {
                    userId: number;
                    spentAt?: {
                        gte?: Date;
                        lt?: Date;
                    };
                    category?: string;
                } = {
                    userId: context.userId,
                };

                if (parsedStartDate || parsedEndDate) {
                    where.spentAt = {};

                    if (parsedStartDate) {
                        where.spentAt.gte = parsedStartDate;
                    }

                    if (parsedEndDate) {
                        where.spentAt.lt = parsedEndDate;
                    }
                }

                if (category) {
                    where.category = category;
                }

                const expenses = await this.prisma.expense.findMany({
                    where,
                    orderBy: {
                        spentAt: 'desc',
                    },
                    take: limit,
                    select: {
                        id: true,
                        amount: true,
                        category: true,
                        title: true,
                        memo: true,
                        spentAt: true,
                    },
                });

                return JSON.stringify({
                    count: expenses.length,
                    startDate: parsedStartDate?.toISOString() ?? null,
                    endDate: parsedEndDate?.toISOString() ?? null,
                    category: category ?? null,
                    limit,
                    expenses: expenses.map((expense) => ({
                        id: expense.id,
                        amount: expense.amount,
                        category: expense.category,
                        title: expense.title,
                        memo: expense.memo,
                        spentAt: expense.spentAt.toISOString(),
                    })),
                });
            },
            {
                name: 'get_expense_list',
                description:
                    '사용자가 확인하기 위한 개별 지출 기록 목록을 최신순으로 조회한다. 오늘 무엇을 썼는지, 최근 지출 몇 건, 특정 기간이나 카테고리의 지출 내역을 보여줄 때 사용한다. 총액이나 카테고리별 합계만 필요한 질문에는 사용하지 않으며, 수정·삭제할 대상을 식별하는 용도로도 사용하지 않는다.',
                schema: z.object({
                    startDate: z
                        .string()
                        .optional()
                        .describe('선택 조회 시작 날짜. ISO 8601 문자열로 입력하며 이 날자를 포함한다. 예: 2026-07-15T00:00:00+09:00'),
                    endDate: z
                        .string()
                        .optional()
                        .describe('선택 조회 종료 날짜. ISO 8601 문자열로 입력하며 이 날자를 포함하지 않는다. 예: 2026-07-16T00:00:00+09:00'),
                    category: expenseCategorySchema
                        .optional()
                        .describe('선택 지출 카테고리. 특정 카테고리의 지출만 조회할 때 사용한다.'),
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(50)
                        .default(10)
                        .describe('조회할 최대 지출 개수. 기본값은 10이고 최대 50이다.'),
                }),
            },
        );
    }

    private createFindExpensesTool(context: AgentToolContext) {
        return tool(
            async ({
                title,
                amount,
                category,
                startDate,
                endDate,
                limit = 10,
            }) => {
                this.logger.log('[tool] find_expenses');

                const parsedStartDate = startDate
                    ? new Date(startDate)
                    : undefined;

                const parsedEndDate = endDate
                    ? new Date(endDate)
                    : undefined;

                if (
                    parsedStartDate &&
                    Number.isNaN(parsedStartDate.getTime())
                ) {
                    return '조회 시작 날짜 형식이 올바르지 않습니다. startDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if (
                    parsedEndDate &&
                    Number.isNaN(parsedEndDate.getTime())
                ) {
                    return '조회 종료 날짜 형식이 올바르지 않습니다. endDate는 ISO 날짜 문자열이어야 합니다.';
                }

                if (
                    parsedStartDate &&
                    parsedEndDate &&
                    parsedStartDate >= parsedEndDate
                ) {
                    return '조회 시작 날짜는 종료 날짜보다 이전이어야 합니다.';
                }

                const where: {
                    userId: number;
                    title?: {
                        contains: string;
                    };
                    amount?: number;
                    category?: string;
                    spentAt?: {
                        gte?: Date;
                        lt?: Date;
                    };
                } = {
                    userId: context.userId,
                };

                if (title) {
                    where.title = {
                        contains: title,
                    };
                }

                if (amount !== undefined) {
                    where.amount = amount;
                }

                if (category) {
                    where.category = category;
                }

                if (parsedStartDate || parsedEndDate) {
                    where.spentAt = {};

                    if (parsedStartDate) {
                        where.spentAt.gte = parsedStartDate;
                    }

                    if (parsedEndDate) {
                        where.spentAt.lt = parsedEndDate;
                    }
                }

                const expenses = await this.prisma.expense.findMany({
                    where,
                    orderBy: {
                        spentAt: 'desc',
                    },
                    take: limit,
                    select: {
                        id: true,
                        amount: true,
                        category: true,
                        title: true,
                        memo: true,
                        spentAt: true,
                    },
                });

                return JSON.stringify({
                    count: expenses.length,
                    searchConditions: {
                        title: title ?? null,
                        amount: amount ?? null,
                        category: category ?? null,
                        startDate: parsedStartDate?.toISOString() ?? null,
                        endDate: parsedEndDate?.toISOString() ?? null,
                        limit,
                    },
                    expenses: expenses.map((expense) => ({
                        id: expense.id,
                        amount: expense.amount,
                        category: expense.category,
                        title: expense.title,
                        memo: expense.memo,
                        spentAt: expense.spentAt.toISOString(),
                    })),
                });
            },
            {
                name: 'find_expenses',
                description:
                    '사용자가 기존 지출을 수정하거나 삭제하려고 할 때 대상 후보를 식별한다. 제목, 금액, 카테고리와 날짜 조건으로 기존 지출을 검색한다. 일반적인 지출 내역 조회에는 사용하지 않으며, 이 tool 자체는 지출을 수정하거나 삭제하지 않는다. 후보가 여러 개이면 후보 목록을 반환해 사용자가 대상을 선택할 수 있게 한다.',
                schema: z.object({
                    title: z
                        .string()
                        .trim()
                        .min(1)
                        .optional()
                        .describe(
                            '선택 지출 제목 검색어. 제목에 이 문자열이 포함된 지출을 찾는다. 예: 편의점, 점심, 지하철',
                        ),
                    amount: z
                        .number()
                        .int()
                        .positive()
                        .optional()
                        .describe(
                            '선택 지출 금액. 해당 금액과 정확히 일치하는 지출을 찾는다.',
                        ),
                    category: expenseCategorySchema
                        .optional()
                        .describe(
                            '선택 지출 카테고리. 특정 카테고리의 지출만 찾을 때 사용한다.',
                        ),
                    startDate: z
                        .string()
                        .optional()
                        .describe(
                            '선택 조회 시작 날짜. ISO 8601 문자열이며 해당 시각을 포함한다.',
                        ),
                    endDate: z
                        .string()
                        .optional()
                        .describe(
                            '선택 조회 종료 날짜. ISO 8601 문자열이며 해당 시각은 포함하지 않는다.',
                        ),
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(20)
                        .default(10)
                        .describe(
                            '반환할 최대 후보 개수. 기본값은 10이고 최대 20이다.',
                        ),
                }),
            },
        );
    }

    private createUpdateExpenseTool(context: AgentToolContext) {
        return tool(
            async ({
                expenseId,
                amount,
                category,
                title,
                memo,
                spentAt,
            }) => {
                this.logger.log('[tool] update_expense');

                const updateData: {
                    amount?: number;
                    category?: string;
                    title?: string;
                    memo?: string | null;
                    spentAt?: Date;
                } = {};

                if (amount !== undefined) {
                    updateData.amount = amount;
                }

                if (category !== undefined) {
                    updateData.category = category;
                }

                if (title !== undefined) {
                    updateData.title = title;
                }

                if (memo !== undefined) {
                    updateData.memo = memo;
                }

                if (spentAt !== undefined) {
                    const parsedSpentAt = new Date(spentAt);

                    if (Number.isNaN(parsedSpentAt.getTime())) {
                        return '지출 날짜 형식이 올바르지 않습니다. spentAt은 ISO 날짜 문자열이어야 합니다.';
                    }

                    updateData.spentAt = parsedSpentAt;
                }

                if (Object.keys(updateData).length === 0) {
                    return '수정할 내용이 없습니다.';
                }

                const expense =
                    await this.prisma.expense.findFirst({
                        where: {
                            id: expenseId,
                            userId: context.userId,
                        },
                        select: {
                            id: true,
                            amount: true,
                            category: true,
                            title: true,
                            memo: true,
                            spentAt: true,
                        },
                    });

                if (!expense) {
                    return '수정할 지출 기록을 찾을 수 없습니다.';
                }

                const changes: {
                    amount?: number;
                    category?: string;
                    title?: string;
                    memo?: string | null;
                    spentAt?: string;
                } = {
                    amount: updateData.amount,
                    category: updateData.category,
                    title: updateData.title,
                    memo: updateData.memo,
                    spentAt:
                        updateData.spentAt?.toISOString(),
                };

                const approvalRequest = {
                    type: 'expense_update_approval',
                    action: 'update_expense',
                    message: '이 지출 기록을 수정할까요?',
                    expense: {
                        id: expense.id,
                        amount: expense.amount,
                        category: expense.category,
                        title: expense.title,
                        memo: expense.memo,
                        spentAt: expense.spentAt.toISOString(),
                    },
                    changes,
                } satisfies ExpenseUpdateApprovalRequest;

                const resumeValue: unknown = interrupt(approvalRequest);

                const decisionResult =
                    updateExpenseDecisionSchema.safeParse(resumeValue);

                if (!decisionResult.success) {
                    return '지출 수정 승인 응답 형식이 올바르지 않습니다.';
                }

                const decision = decisionResult.data;

                if (decision.action === 'cancel') {
                    return JSON.stringify({
                        updated: false,
                        status: 'cancelled',
                        expenseId,
                        message: '지출 수정을 취소했습니다.',
                    });
                }

                if (decision.action === 'revise') {
                    return JSON.stringify({
                        updated: false,
                        status: 'revision_requested',

                        expense: {
                            id: expense.id,
                            amount: expense.amount,
                            category: expense.category,
                            title: expense.title,
                            memo: expense.memo,
                            spentAt:
                                expense.spentAt.toISOString(),
                        },

                        previousChanges: changes,

                        revisionRequest: decision.content,

                        nextAction:
                            '사용자의 revisionRequest를 반영해 수정 값을 다시 결정하고 update_expense를 다시 호출한다.',
                    });
                }

                const updateResult =
                    await this.prisma.expense.updateMany({
                        where: {
                            id: expenseId,
                            userId: context.userId,
                        },
                        data: updateData,
                    });

                if (updateResult.count === 0) {
                    return '수정할 지출 기록을 찾을 수 없습니다.';
                }

                const updatedExpense =
                    await this.prisma.expense.findFirst({
                        where: {
                            id: expenseId,
                            userId: context.userId,
                        },
                        select: {
                            id: true,
                            amount: true,
                            category: true,
                            title: true,
                            memo: true,
                            spentAt: true,
                        },
                    });

                if (!updatedExpense) {
                    return '수정된 지출 기록을 조회하지 못했습니다.';
                }

                return JSON.stringify({
                    updated: true,
                    expense: {
                        id: updatedExpense.id,
                        amount: updatedExpense.amount,
                        category: updatedExpense.category,
                        title: updatedExpense.title,
                        memo: updatedExpense.memo,
                        spentAt:
                            updatedExpense.spentAt.toISOString(),
                    },
                    message: '지출 기록을 수정했습니다.',
                });
            },
            {
                name: 'update_expense',
                description:
                    '기존 지출 기록을 수정한다. 수정할 지출의 id와 변경 내용이 명확해지면 즉시 호출한다. 최종 사용자 승인은 이 tool 내부의 interrupt에서 처리하므로, tool 호출 전에 별도의 승인 질문을 하지 않는다. 새 지출 저장이나 일반적인 지출 조회에는 사용하지 않는다.',
                schema: z.object({
                    expenseId: z
                        .number()
                        .int()
                        .positive()
                        .describe(
                            '수정할 지출 기록의 고유 id. find_expenses로 식별한 id를 사용한다.',
                        ),
                    amount: z
                        .number()
                        .int()
                        .positive()
                        .optional()
                        .describe(
                            '변경할 지출 금액. 변경하지 않으면 생략한다.',
                        ),
                    category: expenseCategorySchema
                        .optional()
                        .describe(
                            '변경할 지출 카테고리. 변경하지 않으면 생략한다.',
                        ),
                    title: z
                        .string()
                        .trim()
                        .min(1)
                        .optional()
                        .describe(
                            '변경할 지출 제목. 변경하지 않으면 생략한다.',
                        ),
                    memo: z
                        .string()
                        .nullable()
                        .optional()
                        .describe(
                            '변경할 메모. null이면 기존 메모를 삭제하고, 변경하지 않으면 생략한다.',
                        ),
                    spentAt: z
                        .string()
                        .datetime({
                            offset: true,
                        })
                        .optional()
                        .describe(
                            '변경할 지출 날짜와 시간. 시간대가 포함된 ISO 8601 문자열로 입력하고, 변경하지 않으면 생략한다.',
                        ),
                }),
            },
        );
    }

    private createSearchRagDocumentsTool(context: AgentToolContext) {
        return tool(
            async ({ query, limit }) => {
                this.logger.log('[tool] search_rag_documents');

                const results = await this.ragSearchService.search(
                    context.userId,
                    query,
                    limit,
                );

                return JSON.stringify({
                    query,
                    count: results.length,
                    results: results.map((result) => ({
                        chunkId: result.chunkId,
                        documentId: result.documentId,
                        chunkIndex: result.chunkIndex,
                        fileName: result.fileName,
                        content: result.content,
                        similarity: result.similarity,
                    })),
                });
            },
            {
                name: 'search_rag_documents',
                description:
                    '사용자가 업로드한 문서에서 질문과 관련된 내용을 의미 기반으로 검색한다. 사용자가 자신의 문서, 이력서, 메모, 자료 또는 업로드한 파일의 내용을 묻거나 문서에서 정보를 찾아달라고 요청할 때 사용한다. 일반 상식 질문이나 지출 데이터 조회에는 사용하지 않는다.',
                schema: z.object({
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .describe(
                            '문서에서 검색할 구체적인 질문 또는 검색 문장',
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
                }),
            },
        );
    }

}