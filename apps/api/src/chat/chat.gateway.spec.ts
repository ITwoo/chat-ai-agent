import {
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals';
import { ChatGateway } from './chat.gateway';
import type {
    PendingAgentApproval,
} from './types/pending-agent-approval.type';
import type {
    AgentRunContext,
    AgentStreamEvent,
} from '../agent/agent.service';
import type {
    RedisLock,
} from '../redis/redis-lock.service';

describe('ChatGateway', () => {
    let gateway: ChatGateway;

    const assertRoomOwner = jest.fn<
        (roomId: number, userId: number) => Promise<void>
    >();

    const findByRoomId = jest.fn<
        (roomId: number) => Promise<PendingAgentApproval | null>
    >();

    const deleteByRoomId = jest.fn<
        (roomId: number) => Promise<void>
    >();

    const hasPendingInterrupt = jest.fn<
        (userId: number, threadId: string) => Promise<boolean>
    >();

    const getRetryableUserMessage = jest.fn<
        (
            roomId: number,
            userId: number,
            userMessageId: number,
        ) => Promise<object>
    >();

    type RetryReplyMock = (
        userId: number,
        runContext: AgentRunContext,
        signal?: AbortSignal,
    ) => AsyncGenerator<AgentStreamEvent>;

    const retryReply = jest.fn<RetryReplyMock>();

    const consume = jest.fn<
        () => Promise<{
            allowed: boolean;
            remaining: number;
            retryAfterMs: number;
        }>
    >();

    const acquire = jest.fn<
        (
            key: string,
            ttlMs: number,
        ) => Promise<RedisLock | null>
    >();

    const release = jest.fn<
        (lock: RedisLock) => Promise<boolean>
    >();

    type ResumeReplyMock = (
        userId: number,
        runContext: AgentRunContext,
        decision: unknown,
        signal?: AbortSignal,
    ) => AsyncGenerator<AgentStreamEvent>;

    const resumeReply = jest.fn<ResumeReplyMock>();

    const saveAssistantMessage = jest.fn<
        (
            roomId: number,
            userId: number,
            content: string,
            ragCitations: unknown[],
        ) => Promise<object>
    >();

    const saveRetriedAssistantMessage = jest.fn<
        (
            roomId: number,
            userId: number,
            userMessageId: number,
            content: string,
            ragCitations: unknown[],
        ) => Promise<{
            userMessage: object;
            assistantMessage: object;
        }>
    >();

    const summarizeRoom = jest.fn<
        (roomId: number, userId: number) => Promise<void>
    >();

    const approvalId =
        '550e8400-e29b-41d4-a716-446655440000';

    beforeEach(() => {
        assertRoomOwner.mockReset();
        findByRoomId.mockReset();
        deleteByRoomId.mockReset();
        hasPendingInterrupt.mockReset();
        getRetryableUserMessage.mockReset();
        retryReply.mockReset();
        consume.mockReset();
        acquire.mockReset();
        release.mockReset();
        resumeReply.mockReset();
        saveAssistantMessage.mockReset();
        saveRetriedAssistantMessage.mockReset();
        summarizeRoom.mockReset();

        assertRoomOwner.mockResolvedValue(undefined);
        deleteByRoomId.mockResolvedValue(undefined);

        getRetryableUserMessage.mockResolvedValue({});

        consume.mockResolvedValue({
            allowed: true,
            remaining: 9,
            retryAfterMs: 0,
        });

        release.mockResolvedValue(true);

        saveAssistantMessage.mockResolvedValue({
            id: 200,
            content: '수정했습니다.',
        });

        saveRetriedAssistantMessage.mockResolvedValue({
            userMessage: {
                id: 100,
            },
            assistantMessage: {
                id: 200,
                content: '재시도 응답입니다.',
            },
        });

        summarizeRoom.mockResolvedValue(undefined);

        gateway = new ChatGateway(
            {
                assertRoomOwner,
                getRetryableUserMessage,
                saveAssistantMessage,
                saveRetriedAssistantMessage,
            } as never,
            {
                summarizeRoom,
            } as never,
            {} as never,
            {} as never,
            {
                hasPendingInterrupt,
                retryReply,
                resumeReply,
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {
                findByRoomId,
                deleteByRoomId,
            } as never,
            {
                acquire,
                release,
            } as never,
            {
                consume,
            } as never,
        );
    });

    it('should be defined', () => {
        expect(gateway).toBeDefined();
    });

    it('서버 재시작 후 저장된 승인 요청을 복구한다', async () => {
        const pendingApproval: PendingAgentApproval = {
            approvalId,
            threadId: 'agent-thread-1',
            originUserMessageId: 100,
            request: {
                type: 'expense_update_approval',
                action: 'update_expense',
                message: '지출을 수정할까요?',
                expense: {
                    id: 1,
                    amount: 8500,
                    category: '식비',
                    title: '편의점',
                    memo: null,
                    spentAt: '2026-08-10T12:00:00+09:00',
                    version: 1,
                },
                changes: {
                    amount: 9500,
                },
            },
        };

        findByRoomId.mockResolvedValue(
            pendingApproval,
        );

        hasPendingInterrupt.mockResolvedValue(true);

        const join = jest.fn<
            (roomName: string) => Promise<void>
        >();

        join.mockResolvedValue(undefined);

        const emit = jest.fn<
            (event: string, payload: unknown) => void
        >();

        const client = {
            id: 'socket-1',
            data: {
                user: {
                    id: 1,
                    username: 'test-user',
                },
            },
            join,
            emit,
        } as never;

        await gateway.handleJoinRoom(
            client,
            {
                roomId: 10,
            },
        );

        expect(assertRoomOwner)
            .toHaveBeenCalledWith(10, 1);

        expect(join)
            .toHaveBeenCalledWith('chat_room:10');

        expect(findByRoomId)
            .toHaveBeenCalledWith(10);

        expect(hasPendingInterrupt)
            .toHaveBeenCalledWith(
                1,
                'agent-thread-1',
            );

        expect(emit).toHaveBeenCalledWith(
            'assistant_approval_required',
            {
                roomId: 10,
                approvalId:
                    pendingApproval.approvalId,
                userMessageId: 100,
                request:
                    pendingApproval.request,
            },
        );
    });

    it(
        'LangGraph interrupt가 없으면 저장된 stale 승인을 삭제한다',
        async () => {
            const pendingApproval: PendingAgentApproval = {
                approvalId,
                threadId: 'agent-thread-1',
                originUserMessageId: 100,
                request: {
                    type: 'expense_update_approval',
                    action: 'update_expense',
                    message: '지출을 수정할까요?',
                    expense: {
                        id: 1,
                        amount: 8500,
                        category: '식비',
                        title: '편의점',
                        memo: null,
                        spentAt: '2026-08-10T12:00:00+09:00',
                        version: 1,
                    },
                    changes: {
                        amount: 9500,
                    },
                },
            };

            findByRoomId.mockResolvedValue(
                pendingApproval,
            );

            hasPendingInterrupt.mockResolvedValue(false);

            const join = jest.fn<
                (roomName: string) => Promise<void>
            >();

            join.mockResolvedValue(undefined);

            const emit = jest.fn<
                (event: string, payload: unknown) => void
            >();

            const client = {
                id: 'socket-1',
                data: {
                    user: {
                        id: 1,
                        username: 'test-user',
                    },
                },
                join,
                emit,
            } as never;

            await gateway.handleJoinRoom(
                client,
                {
                    roomId: 10,
                },
            );

            expect(findByRoomId)
                .toHaveBeenCalledWith(10);

            expect(hasPendingInterrupt)
                .toHaveBeenCalledWith(
                    1,
                    'agent-thread-1',
                );

            expect(deleteByRoomId)
                .toHaveBeenCalledWith(10);

            expect(emit)
                .not
                .toHaveBeenCalledWith(
                    'assistant_approval_required',
                    expect.anything(),
                );
        },
    );

    it(
        'retry_message는 실패한 원본 메시지의 Agent thread를 재사용한다',
        async () => {
            const emit = jest.fn();

            const client = {
                id: 'socket-1',
                data: {
                    user: {
                        id: 1,
                        username: 'test-user',
                    },
                },
                emit,
            } as never;

            const serverEmit = jest.fn();

            gateway.server = {
                to: jest.fn().mockReturnValue({
                    emit: serverEmit,
                }),
            } as never;

            retryReply.mockImplementation(
                async function* () {
                    yield {
                        type: 'text_delta',
                        delta: '재시도 응답입니다.',
                    };

                    yield {
                        type: 'completed',
                        ragCitations: [],
                    };
                },
            );

            await gateway.handleRetryMessage(
                client,
                {
                    roomId: 10,
                    userMessageId: 100,
                },
            );

            expect(getRetryableUserMessage)
                .toHaveBeenCalledWith(
                    10,
                    1,
                    100,
                );

            expect(retryReply)
                .toHaveBeenCalledWith(
                    1,
                    {
                        agentThreadId:
                            'chat:1:10:100',
                        conversationThreadId:
                            'chat-room:1:10',
                        roomId: 10,
                        userMessageId: 100,
                    },
                    expect.any(AbortSignal),
                );

            expect(saveRetriedAssistantMessage)
                .toHaveBeenCalledWith(
                    10,
                    1,
                    100,
                    '재시도 응답입니다.',
                    [],
                );

            expect(emit)
                .not
                .toHaveBeenCalledWith(
                    'chat_error',
                    expect.anything(),
                );

            expect(summarizeRoom)
                .toHaveBeenCalledWith(10, 1);
        },
    );

    it(
        '동일 승인이 동시에 요청되면 Redis Lock으로 한 번만 처리한다',
        async () => {
            const pendingApproval: PendingAgentApproval = {
                approvalId,
                threadId: 'agent-thread-1',
                originUserMessageId: 100,
                request: {
                    type: 'expense_update_approval',
                    action: 'update_expense',
                    message: '지출을 수정할까요?',
                    expense: {
                        id: 1,
                        amount: 8500,
                        category: '식비',
                        title: '편의점',
                        memo: null,
                        spentAt: '2026-08-10T12:00:00+09:00',
                        version: 1,
                    },
                    changes: {
                        amount: 9500,
                    },
                },
            };

            findByRoomId.mockResolvedValue(
                pendingApproval,
            );

            hasPendingInterrupt.mockResolvedValue(true);

            acquire
                .mockResolvedValueOnce({
                    key:
                        'lock:agent-approval:1:10',
                    token: 'lock-token',
                })
                .mockResolvedValueOnce(null);

            resumeReply.mockImplementation(
                async function* () {
                    yield {
                        type: 'text_delta',
                        delta: '수정했습니다.',
                    };

                    yield {
                        type: 'completed',
                        ragCitations: [],
                    };
                },
            );

            const emit = jest.fn();

            const join = jest.fn<
                (roomName: string) => Promise<void>
            >();

            join.mockResolvedValue(undefined);

            const client = {
                id: 'socket-1',
                data: {
                    user: {
                        id: 1,
                        username: 'test-user',
                    },
                },
                join,
                emit,
            } as never;

            gateway.server = {
                to: jest.fn().mockReturnValue({
                    emit: jest.fn(),
                }),
            } as never;

            await gateway.handleJoinRoom(
                client,
                {
                    roomId: 10,
                },
            );

            emit.mockClear();

            const payload = {
                roomId: 10,
                userMessageId: 100,
                approvalId,
                action: 'approve' as const,
            };

            await Promise.all([
                gateway.handleRespondAgentApproval(
                    client,
                    payload,
                ),
                gateway.handleRespondAgentApproval(
                    client,
                    payload,
                ),
            ]);

            expect(acquire)
                .toHaveBeenCalledTimes(2);

            expect(acquire)
                .toHaveBeenCalledWith(
                    'lock:agent-approval:1:10',
                    300000,
                );

            expect(resumeReply)
                .toHaveBeenCalledTimes(1);

            expect(saveAssistantMessage)
                .toHaveBeenCalledTimes(1);

            expect(emit)
                .toHaveBeenCalledWith(
                    'chat_error',
                    {
                        message:
                            '다른 요청에서 이 승인을 처리하고 있습니다.',
                    },
                );

            expect(release)
                .toHaveBeenCalledTimes(1);
        },
    );
});