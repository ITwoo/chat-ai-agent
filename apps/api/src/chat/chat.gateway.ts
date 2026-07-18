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
import { AgentService } from '../agent/agent.service';
import { agentApprovalResponseSchema } from '../agent/agent-interrupt.schema';

type SocketUser = {
    id: number;
    username: string;
}

type AuthenticatedSocket = Socket & {
    data: {
        user?: User;
    };
};

type JwtPayload = {
    sub: number;
    username: string;
};

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

    constructor(
        private readonly chatService: ChatService,
        private readonly agentService: AgentService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService
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

        const processingKey = `${user.id}:${payload.roomId}`;

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

                this.server.to(roomName).emit(
                    'assistant_approval_required',
                    {
                        roomId: payload.roomId,
                        userMessageId: userMessage.id,
                        request: event.request,
                    },
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

        if(!user) {
            client.emit('chat_error', {
                message: '인증 정보가 없습니다.',
            });
            return;
        }

        const payloadResult = agentApprovalResponseSchema.safeParse(rawPayload);

        if(!payloadResult.success) {
            client.emit('chat_error', {
                message: '승인 응답 형식이 올바르지 않습니다.',
            });
            return;
        }

        const {
            roomId,
            userMessageId,
            action,
        } = payloadResult.data;

        const processingKey = `${user.id}:${roomId}`;

        if(this.processingRooms.has(processingKey)) {
            client.emit('chat_error', {
                message: '이미 이 채팅방에서 AI가 응답 중입니다.',
            });
            return;
        }

        this.processingRooms.add(processingKey);

        const roomName = this.getRoomName(roomId);
        const threadId = this.getAgentThreadId(user.id, roomId, userMessageId);

        const abortController = new AbortController();

        this.abortControllers.set(
            processingKey,
            abortController,
        );

        try {
            await this.chatService.assertRoomOwner(
                roomId,
                user.id,
            );

            this.server.to(roomName).emit(
                'assistant_approval_resolved',
                {
                    roomId,
                    userMessageId,
                    action,
                },
            );

            let assistantContent = '';
            let isWaitingForAproval = false;
            let isCancelled = false;

            for await ( const event of this.agentService.resumeReply(
                user.id,
                threadId,
                {
                    action,
                },
                abortController.signal,
            )) {
                if( this.cancelledRooms.has(processingKey)) {
                    isCancelled = true;
                    break;
                }

                if(event.type === 'text_delta') {
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

                isWaitingForAproval = true;

                this.server.to(roomName).emit(
                    'assistant_approval_required',
                    {
                        roomId,
                        userMessageId,
                        request: event.request,
                    },
                );

                break;
            }

            if(isCancelled) {
                const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(roomId, user.id, userMessageId);

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

            if(isWaitingForAproval) {
                return;
            }

            if(!assistantContent.trim()) {
                throw new Error('AI 응답이 비어 있습니다.');
            }

            const assistantMessage = await this.chatService.saveAssistantMessage(roomId, user.id, assistantContent);

            this.server.to(roomName).emit(
                'assistant_message_completed',
                {
                    roomId,
                    message: assistantMessage,
                },
            );
        } catch (error) {
            if(this.cancelledRooms.has(processingKey) || this.isAbortError(error)) {
                const { userMessage, assistantMessage } = await this.chatService.cancelGeneration(roomId, user.id, userMessageId);

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

            const { userMessage, assistantMessage } = await this.chatService.failGeneration(roomId, user.id, userMessageId);

            this.server.to(roomName).emit(
                'message_updated',
                userMessage,
            );

            this.server.to(roomName).emit(
                'assistant_message_failed',
                {
                    roomId,
                    message: assistantMessage,
                },
            );
        } finally {
            this.processingRooms.delete(processingKey);
            this.cancelledRooms.delete(processingKey);
            this.abortControllers.delete(processingKey);
        }
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

        const processingKey = `${user.id}:${payload.roomId}`;

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
}