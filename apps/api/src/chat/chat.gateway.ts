import { Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AgentService, AgentStreamEvent } from '../agent/agent.service';
import { agentApprovalResponseSchema, ExpenseUpdateApprovalRequest, UpdateExpenseDecision } from '../agent/agent-interrupt.schema';
import { randomUUID } from 'node:crypto';
import { PendingAgentApproval } from './types/pending-agent-approval.type';
import { PendingAgentApprovalStoreService } from './pending-agent-approval-store.service';
import { RedisLock, RedisLockService } from '../redis/redis-lock.service';
import { RedisRateLimitService } from '../redis/redis-rate-limit.service';

type AuthenticatedSocket = Socket & {
    data: {
        user?: User;
    };
};

type AgentApprovalSource =
    | {
        type: 'chat';
        content: string;
    }
    | {
        type: 'button';
        approvalId: string;
        originUserMessageId: number;
        action: 'approve' | 'cancel';
    }

const APPROVE_MESSAGES = new Set([
    '승인',
    '승인해',
    '승인할게',
    '진행',
    '진행해',
    '그대로해',
    '수정해',
    '수정해줘',
    'approve',
]);

const CANCEL_MESSAGES = new Set([
    '취소',
    '취소해',
    '취소할게',
    '하지마',
    '수정하지마',
    'cancel',
]);

const CHAT_RATE_LIMIT = 10;
const CHAT_RATE_LIMIT_WINDOW_MS = 60000;

@WebSocketGateway({
    cors: {
        origin: true,
        credentials: true,
    },
})

export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(ChatGateway.name);

    private readonly processingRooms = new Set<string>();
    private readonly cancelledRooms = new Set<string>();
    private readonly abortControllers = new Map<string, AbortController>();
    private readonly pendingApprovals = new Map<string, PendingAgentApproval>();

    constructor(
        private readonly chatService: ChatService,
        private readonly agentService: AgentService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly pendingApprovalStore: PendingAgentApprovalStoreService,
        private readonly redisLockService: RedisLockService,
        private readonly redisRateLimitService: RedisRateLimitService,
    ) { }

    afterInit(server: Server) {
        server.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token;

                if (!token) {
                    return next(new Error('Unauthorized'));
                }

                const payload = await this.jwtService.verifyAsync<{
                    sub: number;
                    username: string;
                }>(token, {
                    secret: this.configService.getOrThrow<string>('JWT_SECRET'),
                });

                const user = await this.prisma.user.findUnique({
                    where: {
                        id: payload.sub,
                    },
                    select: {
                        id: true,
                        username: true,
                    },
                });

                if (!user) {
                    return next(new Error('Unauthorized'));
                }

                socket.data.user = user;

                return next();
            } catch {
                return next(new Error('Unauthorized'));
            }
        });
    }

    async handleConnection(client: AuthenticatedSocket) {
        const user = client.data.user;

        this.logger.log(`Socket connected: ${client.id}, User: ${user.username}`);
    }

    handleDisconnect(client: AuthenticatedSocket) {
        const username = client.data.user?.username || 'Unknown';

        this.logger.log(`Client disconnected: ${client.id}, User: ${username}`);
    }

    @SubscribeMessage('join_room')
    async handleJoinRoom(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() payload: JoinRoomDto,
    ) {

        const user = client.data.user;

        if (!user) {
            client.emit('chat_error', {
                message: '인증 정보가 없습니다.',
            });
            return;
        }

        try {
            const roomName = this.getRoomName(payload.roomId);

            await this.chatService.assertRoomOwner(payload.roomId, user.id);

            await client.join(roomName);

            client.emit('joined_room', {
                roomId: payload.roomId,
            });

            await this.restorePendingApproval(
                client,
                user.id,
                payload.roomId,
            );

            this.logger.log(`Client ${client.id} joined ${roomName}`);
        } catch (error) {
            client.emit('chat_error', {
                message:
                    error instanceof Error ? error.message : '방 참여에 실패했습니다.',
            });
        }
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() payload: SendMessageDto,
    ) {
        const user = client.data.user;

        if (!user) {
            client.emit('chat_error', {
                message: '인증 정보가 없습니다.',
            });
            return;
        }

        const processingKey = this.getUserRoomKey(
            user.id,
            payload.roomId
        );

        const pendingApproval = this.pendingApprovals.get(processingKey);

        if (pendingApproval) {
            await this.processAgentApproval(
                client,
                user,
                payload.roomId,
                {
                    type: 'chat',
                    content: payload.content,
                },
            );

            return;
        }

        try {
            const rateLimit = await this.redisRateLimitService.consume(
                `rate-limit:agent-chat:${user.id}`,
                CHAT_RATE_LIMIT,
                CHAT_RATE_LIMIT_WINDOW_MS,
            );

            if (!rateLimit.allowed) {
                const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000);

                client.emit('chat_error', {
                    message: `요청이 너무 많습니다. ${retryAfterSeconds}초 후 다시 시도해주세요.`,
                });
                return;
            }
        } catch (error) {
            this.logger.error(
                `채팅 요청 제한 확인 실패: userId=${user.id}`,
                error instanceof Error ? error.stack : String(error),
            );

            client.emit('chat_error', {
                message: '요청 제한 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
            });
            return;
        }

        if (this.processingRooms.has(processingKey)) {
            client.emit('chat_error', {
                message: '이미 이 채팅방에서 AI가 응답 중입니다.',
            });
            return;
        }

        this.processingRooms.add(processingKey);

        const roomName = this.getRoomName(payload.roomId);

        let userMessageId: number | null = null;

        try {

            const userMessage = await this.chatService.saveUserMessage(
                payload.roomId,
                user,
                payload.content,
            );

            userMessageId = userMessage.id;

            const agentThreadId = this.getAgentThreadId(user.id, payload.roomId, userMessage.id);

            this.server.to(roomName).emit('message_created', userMessage);

            const updatedRoom = await this.chatService.updateRoomTitleFromFirstMessage(
                payload.roomId,
                user.id,
                userMessage.content,
            );

            this.server.to(roomName).emit('chat_room_updated', updatedRoom)

            const contextMessages = await this.chatService.getContextMessages(
                payload.roomId,
                user.id,
            );

            this.server.to(roomName).emit('assistant_message_started', {
                roomId: payload.roomId,
            })

            let assistantContent = '';
            let isCancelled = false;
            let isWaitingForApproval = false;

            const abortController = new AbortController();
            this.abortControllers.set(processingKey, abortController)

            for await (const event of this.agentService.streamReply(
                user.id,
                contextMessages,
                agentThreadId,
                abortController.signal,
            )) {
                if (this.cancelledRooms.has(processingKey)) {
                    isCancelled = true;
                    break;
                }

                if (event.type === 'text_delta') {
                    assistantContent += event.delta;

                    this.server.to(roomName).emit(
                        'assistant_message_delta',
                        {
                            roomId: payload.roomId,
                            delta: event.delta,
                        },
                    );

                    continue;
                }

                isWaitingForApproval = true;

                await this.setPendingApproval(
                    user.id,
                    payload.roomId,
                    userMessage.id,
                    event,
                );

                break;
            }

            if (isCancelled) {
                if (userMessageId) {
                    const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(
                        payload.roomId,
                        user.id,
                        userMessageId,
                    );

                    this.server.to(roomName).emit('message_updated', userMessage);

                    this.server.to(roomName).emit('assistant_message_cancelled', {
                        roomId: payload.roomId,
                        message: assistantMessage,
                    });
                } else {
                    this.server.to(roomName).emit('assistant_message_cancelled', {
                        roomId: payload.roomId,
                    });
                }

                return;
            }

            if (isWaitingForApproval) {
                return;
            }

            if (!assistantContent.trim()) {
                throw new Error('AI 응답이 비어 있습니다.');
            }

            const assistantMessage = await this.chatService.saveAssistantMessage(
                payload.roomId,
                user.id,
                assistantContent,
            );

            this.server.to(roomName).emit('assistant_message_completed', {
                roomId: payload.roomId,
                message: assistantMessage,
            });

        } catch (error) {
            if (
                this.cancelledRooms.has(processingKey) ||
                this.isAbortError(error)
            ) {
                if (userMessageId) {
                    const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(
                        payload.roomId,
                        user.id,
                        userMessageId,
                    );

                    this.server.to(roomName).emit('message_updated', userMessage);

                    this.server.to(roomName).emit('assistant_message_cancelled', {
                        roomId: payload.roomId,
                        message: assistantMessage,
                    });
                } else {
                    this.server.to(roomName).emit('assistant_message_cancelled', {
                        roomId: payload.roomId,
                    });
                }

                return;
            }

            if (userMessageId) {
                const { userMessage, assistantMessage } = await this.chatService.failGeneration(
                    payload.roomId,
                    user.id,
                    userMessageId,
                );

                this.server.to(roomName).emit('message_updated', userMessage);

                this.server.to(roomName).emit('assistant_message_failed', {
                    roomId: payload.roomId,
                    message: assistantMessage,
                });

                return;
            }

            client.emit('chat_error', {
                message:
                    error instanceof Error ? error.message : '메시지 전송에 실패했습니다.',
            });

        } finally {
            this.processingRooms.delete(processingKey);
            this.cancelledRooms.delete(processingKey);
            this.abortControllers.delete(processingKey);
        }
    }

    @SubscribeMessage('respond_agent_approval')
    async handleRespondAgentApproval(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() rawPayload: unknown,
    ) {
        const user = client.data.user;

        if (!user) {
            client.emit('chat_error', {
                message: '인증 정보가 없습니다.',
            });
            return;
        }

        const payloadResult = agentApprovalResponseSchema.safeParse(rawPayload);

        if (!payloadResult.success) {
            client.emit('chat_error', {
                message: '승인 응답 형식이 올바르지 않습니다.',
            });
            return;
        }

        const {
            roomId,
            userMessageId,
            approvalId,
            action,
        } = payloadResult.data;

        await this.processAgentApproval(
            client,
            user,
            roomId,
            {
                type: 'button',
                approvalId,
                originUserMessageId: userMessageId,
                action,
            },
        );
    }

    @SubscribeMessage('leave_room')
    async handleLeaveRoom(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() payload: JoinRoomDto,
    ) {
        const roomName = this.getRoomName(payload.roomId);

        await client.leave(roomName);

        client.emit('left_room', {
            roomId: payload.roomId,
        });

        this.logger.log(`Client ${client.id} left ${roomName}`);
    }

    @SubscribeMessage('stop_generation')
    handleStopGeneration(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() payload: JoinRoomDto,
    ) {
        const user = client.data.user;

        if (!user) {
            client.emit('chat_error', {
                message: '인증 정보가 없습니다.',
            });
            return;
        }

        const processingKey = this.getUserRoomKey(
            user.id,
            payload.roomId,
        );

        this.cancelledRooms.add(processingKey);

        const abortController = this.abortControllers.get(processingKey);
        abortController?.abort();

        const roomName = this.getRoomName(payload.roomId);

        this.server.to(roomName).emit('assistant_message_cancelled', {
            roomId: payload.roomId,
        })

        this.logger.log(`Generation stop requested. userId ${user.id}, roomId=${payload.roomId}`)
    }


    private extractToken(client: AuthenticatedSocket): string | null {
        const authToken = client.handshake.auth.token;

        if (typeof authToken === 'string' && authToken.trim()) {
            return authToken;
        }

        const authorization = client.handshake.headers['authorization'];

        if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
            return authorization.replace('Bearer ', '');
        }

        return null;
    }

    private getRoomName(roomId: number) {
        return `chat_room:${roomId}`;
    }

    private isAbortError(error: unknown) {
        if (!(error instanceof Error)) {
            return false;
        }

        return (
            error.name === 'AbortError' ||
            error.name === 'ModelAbortError' ||
            error.message.toLowerCase().includes('abort')
        );
    }

    private getAgentThreadId(
        userId: number,
        roomId: number,
        userMessageId: number,
    ): string {
        return `chat:${userId}:${roomId}:${userMessageId}`;
    }

    private getUserRoomKey(
        userId: number,
        roomId: number,
    ): string {
        return `${userId}:${roomId}`;
    }

    private createApprovalId(): string {
        return randomUUID();
    }

    private parseApprovalDecision(
        content: string,
    ): UpdateExpenseDecision | null {
        const normalized = content
            .trim()
            .replace(/\s+/g, '')
            .replace(/[.!?]+$/g, '')
            .toLocaleLowerCase();

        if (APPROVE_MESSAGES.has(normalized)) {
            return {
                action: 'approve',
            };
        }

        if (CANCEL_MESSAGES.has(normalized)) {
            return {
                action: 'cancel'
            };
        }

        return null;
    }

    private createApprovalRequestMessage(
        request: ExpenseUpdateApprovalRequest,
    ): string {
        const changes: string[] = [];

        if (
            request.changes.amount !== undefined &&
            request.changes.amount !== request.expense.amount
        ) {
            changes.push(
                `금액: ${request.expense.amount.toLocaleString()}원 → ` +
                `${request.changes.amount.toLocaleString()}원`,
            );
        }

        if (
            request.changes.title !== undefined &&
            request.changes.title !== request.expense.title
        ) {
            changes.push(
                `제목: ${request.expense.title} → ${request.changes.title}`,
            );
        }

        if (
            request.changes.category !== undefined &&
            request.changes.category !== request.expense.category
        ) {
            changes.push(
                `카테고리: ${request.expense.category} → ${request.changes.category}`,
            );
        }

        if (
            request.changes.spentAt !== undefined &&
            request.changes.spentAt !== request.expense.spentAt
        ) {
            changes.push(
                `날짜: ${request.expense.spentAt} → ${request.changes.spentAt}`,
            );
        }

        if (
            request.changes.memo !== undefined &&
            request.changes.memo !== request.expense.memo
        ) {
            changes.push(
                `메모: ${request.expense.memo ?? '없음'} → ` +
                `${request.changes.memo ?? '없음'}`,
            );
        }

        return [
            `${request.expense.title} 지출을 다음과 같이 수정할까요?`,
            ...changes.map((change) => `- ${change}`),
        ].join('\n');
    }

    private async setPendingApproval(
        userId: number,
        roomId: number,
        originUserMessageId: number,
        event: Extract<
            AgentStreamEvent,
            { type: 'approval_required' }
        >,
    ): Promise<void> {
        const approvalKey = this.getUserRoomKey(
            userId,
            roomId,
        );

        const approvalId = this.createApprovalId();

        const pendingApproval: PendingAgentApproval = {
            approvalId,
            threadId: event.threadId,
            originUserMessageId,
            request: event.request,
        };

        await this.pendingApprovalStore.save(roomId, pendingApproval);

        const roomName = this.getRoomName(roomId);

        const approvalRequestMessage =
            await this.chatService.saveAssistantMessage(
                roomId,
                userId,
                this.createApprovalRequestMessage(event.request),
            );

        this.server.to(roomName).emit(
            'message_created',
            approvalRequestMessage,
        );

        this.pendingApprovals.set(approvalKey, pendingApproval);

        this.server.to(roomName).emit(
            'assistant_approval_required',
            {
                roomId,
                approvalId,
                userMessageId: originUserMessageId,
                request: event.request,
            },
        );
    }

    private async processAgentApproval(
        client: AuthenticatedSocket,
        user: NonNullable<AuthenticatedSocket['data']['user']>,
        roomId: number,
        source: AgentApprovalSource,
    ): Promise<void> {
        const processingKey = this.getUserRoomKey(
            user.id,
            roomId,
        );

        const pendingApproval = this.pendingApprovals.get(processingKey);

        if (!pendingApproval) {
            client.emit('chat_error', {
                message: '대기 중인 승인 요청이 없습니다.',
            });
            return;
        }

        if (
            source.type === 'button' &&
            (
                source.approvalId !== pendingApproval.approvalId ||
                source.originUserMessageId !== pendingApproval.originUserMessageId
            )
        ) {
            client.emit('chat_error', {
                message: '이미 처리되었거나 오래된 승인 요청입니다.',
            });
            return;
        }

        if (this.processingRooms.has(processingKey)) {
            client.emit('chat_error', {
                message: '이미 이 채팅방에서 AI가 응답 중입니다.',
            });
            return;
        }

        let approvalLock: RedisLock | null;

        try {
            approvalLock = await this.redisLockService.acquire(
                `lock:agent-approval:${processingKey}`,
                300000,
            );
        } catch (error) {
            this.logger.error(
                `승인 처리 Redis 락 획득 실패: ${processingKey}`,
                error instanceof Error ? error.stack : String(error),
            );

            client.emit('chat_error', {
                message: '승인 처리 상태를 확인하지 못했습니다. 다시 시도해주세요.',
            });
            return;
        }

        if(!approvalLock) {
            client.emit('chat_error', {
                message: '다른 요청에서 이 승인을 처리하고 있습니다.',
            });
            return;
        }

        this.processingRooms.add(processingKey);

        const roomName = this.getRoomName(roomId);

        const abortController = new AbortController();

        this.abortControllers.set(
            processingKey,
            abortController,
        );

        let statusUserMessageId = pendingApproval.originUserMessageId;

        try {
            await this.chatService.assertRoomOwner(
                roomId,
                user.id,
            );

            if (source.type === 'chat') {
                const approvalMessage = await this.chatService.saveUserMessage(
                    roomId,
                    user,
                    source.content,
                );

                statusUserMessageId = approvalMessage.id;

                this.server.to(roomName).emit(
                    'message_created',
                    approvalMessage,
                );
            }

            const decision =
                await this.resolveApprovalDecision(
                    pendingApproval.request,
                    source,
                );

            if (!decision) {
                client.emit('chat_error', {
                    message:
                        '현재 변경 내용을 승인할지, 취소할지, 또는 어떤 내용을 변경할지 조금 더 명확하게 말씀해주세요.',
                });

                return;
            }

            await this.pendingApprovalStore.deleteByRoomId(roomId);
            
            this.pendingApprovals.delete(processingKey);

            this.server.to(roomName).emit(
                'assistant_approval_resolved',
                {
                    roomId,
                    approvalId: pendingApproval.approvalId,
                    userMessageId: pendingApproval.originUserMessageId,
                    action: decision.action,
                },
            );

            this.server.to(roomName).emit(
                'assistant_message_started',
                {
                    roomId,
                },
            );

            let assistantContent = '';
            let isCancelled = false;
            let isWaitingForApproval = false;

            for await (const event of this.agentService.resumeReply(
                user.id,
                pendingApproval.threadId,
                decision,
                abortController.signal,
            )) {
                if (this.cancelledRooms.has(processingKey)) {
                    isCancelled = true;
                    break;
                }

                if (event.type === 'text_delta') {
                    assistantContent += event.delta;

                    this.server.to(roomName).emit(
                        'assistant_message_delta',
                        {
                            roomId,
                            delta: event.delta,
                        },
                    );

                    continue;
                }

                isWaitingForApproval = true;

                await this.setPendingApproval(
                    user.id,
                    roomId,
                    pendingApproval.originUserMessageId,
                    event,
                );

                break;
            }

            if (isCancelled) {
                const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(
                    roomId,
                    user.id,
                    statusUserMessageId,
                );

                this.server.to(roomName).emit(
                    'message_updated',
                    userMessage,
                );

                this.server.to(roomName).emit(
                    'assistant_message_cancelled',
                    {
                        roomId,
                        message: assistantMessage,
                    },
                );

                return;
            }

            if (isWaitingForApproval) {
                return;
            }

            if (!assistantContent.trim()) {
                throw new Error('AI 응답이 비어 있습니다.');
            }

            const assistantMessage = await this.chatService.saveAssistantMessage(
                roomId,
                user.id,
                assistantContent,
            );

            this.server.to(roomName).emit(
                'assistant_message_completed',
                {
                    roomId,
                    message: assistantMessage,
                },
            );
        } catch (error) {
            if (this.cancelledRooms.has(processingKey) || this.isAbortError(error)) {
                const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(
                    roomId,
                    user.id,
                    statusUserMessageId,
                );

                this.server.to(roomName).emit(
                    'message_update',
                    userMessage,
                );

                this.server.to(roomName).emit(
                    'assistant_message_cancelled',
                    {
                        roomId,
                        message: assistantMessage,
                    },
                );

                return;
            }

            this.logger.error(
                `승인 처리 실패: ${processingKey}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );

            await this.pendingApprovalStore.save(roomId, pendingApproval);

            this.pendingApprovals.set(
                processingKey,
                pendingApproval,
            );

            this.server.to(roomName).emit(
                'assistant_approval_required',
                {
                    roomId,
                    approvalId: pendingApproval.approvalId,
                    userMessageId:
                        pendingApproval.originUserMessageId,
                    request: pendingApproval.request,
                },
            );

            client.emit('chat_error', {
                message:
                    '승인 처리에 실패했습니다. 기존 승인 요청은 유지되며 다시 시도할 수 있습니다.',
            });
        } finally {
            this.processingRooms.delete(processingKey);
            this.cancelledRooms.delete(processingKey);
            this.abortControllers.delete(processingKey);

            try {
                const released = await this.redisLockService.release(approvalLock);

                if (!released) {
                    this.logger.warn(`승인 처리 Redis 락이 이미 만료됐습니다: ${processingKey}`);
                }
            } catch (error) {
                this.logger.error(
                    `승인 처리 Redis 락 해제 실패: ${processingKey}`,
                    error instanceof Error ? error.stack : String(error),
                );
            }            
        }
    }

    private async resolveApprovalDecision(
        request: ExpenseUpdateApprovalRequest,
        source: AgentApprovalSource,
    ): Promise<UpdateExpenseDecision | null> {
        if (source.type === 'button') {
            return {
                action: source.action,
            };
        }

        const content = source.content.trim();

        const parsedDecision = this.parseApprovalDecision(content);

        if (parsedDecision) {
            return parsedDecision;
        }

        const result =
            await this.agentService.classifyApprovalIntent(
                request,
                content,
            );

        switch (result.intent) {
            case 'approve':
                return {
                    action: 'approve',
                };

            case 'cancel':
                return {
                    action: 'cancel',
                };

            case 'revise':
                return {
                    action: 'revise',
                    content,
                };

            case 'unclear':
                return null;
        }
    }

    private async restorePendingApproval(
        client: AuthenticatedSocket,
        userId: number,
        roomId: number,
    ): Promise<void> {
        const approvalKey = this.getUserRoomKey(
            userId,
            roomId,
        );

        let pendingApproval = this.pendingApprovals.get(approvalKey);

        if (!pendingApproval) {
            let storedApproval = await this.pendingApprovalStore.findByRoomId(roomId);

            if (!storedApproval) {
                return;
            }

            pendingApproval = storedApproval;

            this.pendingApprovals.set(
                approvalKey,
                pendingApproval,
            );
        }

        client.emit(
            'assistant_approval_required',
            {
                roomId,
                approvalId:
                    pendingApproval.approvalId,
                userMessageId:
                    pendingApproval.originUserMessageId,
                request: pendingApproval.request,
            },
        );
    }

}