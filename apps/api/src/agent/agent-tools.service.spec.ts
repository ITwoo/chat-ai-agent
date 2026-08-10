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

    beforeEach(async () => {
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

});
