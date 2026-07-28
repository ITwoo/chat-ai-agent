import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessage, ChatMessageRole, ChatMessageStatus, ChatRoom, Prisma } from '../generated/prisma/client';
import { RagCitation } from '../rag/schemas/rag-citation.schema';

type ChatUser = {
    id: number;
    username: string;
}

type ChatGenerationResult = {
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
}

const ragCitationSelect = {
    documentId: true,
    chunkId: true,
    chunkIndex: true,
    pageNumber: true,
    fileName: true,
    similarity: true
} as const;

type ChatMessageWithRagCitations = Prisma.ChatMessageGetPayload<{
    include: { ragCitations: { select: typeof ragCitationSelect } };
}>;

const RECENT_CONTEXT_MESSAGE_LIMIT = 20;
const SUMMARY_MESSAGE_BATCH_LIMIT = 40;

const DEFAULT_MESSAGE_PAGE_SIZE = 30;

export type GetMessagesOptions = {
    cursor?: number;
    limit?: number;
}

export type ChatMessagesPageResult = {
    messages: ChatMessageWithRagCitations[];
    nextCursor: number | null;
}

export type ChatSummaryTarget = {
    currentSummary: string | null;
    messages: ChatMessage[];
    throughMessageId: number;
};

@Injectable()
export class ChatService {
    constructor(private readonly prisma: PrismaService) { }

    async createRoom(user: ChatUser, title?: string): Promise<ChatRoom> {
        return this.prisma.chatRoom.create({
            data: {
                title: title?.trim() || '새 채팅',
                userId: user.id,
            },
        });
    }

    async getRooms(user: ChatUser): Promise<ChatRoom[]> {
        return this.prisma.chatRoom.findMany({
            where: {
                userId: user.id,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });
    }

    async getMessages(
        roomId: number,
        user: ChatUser,
        options?: GetMessagesOptions,
    ): Promise<ChatMessagesPageResult> {
        await this.assertRoomOwner(roomId, user.id);

        const limit = options?.limit ?? DEFAULT_MESSAGE_PAGE_SIZE;
        const take = limit + 1;

        const messages = await this.prisma.chatMessage.findMany({
            where: {
                roomId,
                ...(options?.cursor
                    ? {
                        id: {
                            lt: options.cursor,
                        },
                    }
                    : {}
                ),
            },
            include: {
                ragCitations: {
                    select: ragCitationSelect,
                    orderBy: { similarity: 'desc' },
                },
            },
            orderBy: {
                id: 'desc',
            },
            take,
        });

        const hasMore = messages.length > limit;
        const pageMessages = hasMore ? messages.slice(0, limit) : messages;

        return {
            messages: pageMessages.reverse(),
            nextCursor: hasMore
                ? pageMessages[pageMessages.length - 1]?.id ?? null
                : null,
        };
    }

    async saveUserMessage(roomId: number, user: ChatUser, content: string): Promise<ChatMessage> {
        await this.assertRoomOwner(roomId, user.id);

        const normalizedContent = this.normalizeMessageContent(content);

        const userMessage = await this.createMessage({
            roomId,
            role: ChatMessageRole.USER,
            content: normalizedContent,
        });

        return userMessage;
    }

    async assertRoomOwner(roomId: number, userId: number): Promise<ChatRoom> {
        const room = await this.prisma.chatRoom.findUnique({
            where: {
                id: roomId,
            },
        });

        if (!room) {
            throw new NotFoundException('채팅방을 찾을 수 없습니다.');
        }

        if (room.userId !== userId) {
            throw new ForbiddenException('이 채팅방에 접근할 수 없습니다.');
        }

        return room;
    }

    async saveAssistantMessage(roomId: number, userId: number, assistantContent: string, ragCitations: RagCitation[] = []): Promise<ChatMessageWithRagCitations> {
        await this.assertRoomOwner(roomId, userId);

        return this.prisma.$transaction(async (tx) => {
            const assistantMessage = await tx.chatMessage.create({
                data: {
                    roomId,
                    role: ChatMessageRole.ASSISTANT,
                    content: assistantContent,
                    ragCitations: ragCitations.length ? { createMany: { data: ragCitations } } : undefined,
                },
                include: { ragCitations: { select: ragCitationSelect } },
            });

            await tx.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });

            return assistantMessage;
        });
    }

    async getContextMessages(
        roomId: number,
        userId: number,
    ): Promise<ChatMessage[]> {
        return this.getRecentMessages(roomId, userId);
    }

    async getRecentMessages(roomId: number, userId: number): Promise<ChatMessage[]> {
        await this.assertRoomOwner(roomId, userId);

        const messages = await this.prisma.chatMessage.findMany({
            where: {
                roomId,
                status: ChatMessageStatus.COMPLETED,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: RECENT_CONTEXT_MESSAGE_LIMIT,
        });

        return messages.reverse();
    }

    async getSummaryTarget(
        roomId: number,
        userId: number,
    ): Promise<ChatSummaryTarget | null> {
        const room = await this.assertRoomOwner(roomId, userId);

        const where = {
            roomId,
            status: ChatMessageStatus.COMPLETED,
            ...(room.summaryThroughMessageId !== null
                ? {
                    id: {
                        gt: room.summaryThroughMessageId,
                    },
                }
                : {}),
        } satisfies Prisma.ChatMessageWhereInput;

        const unsummarizedMessageCount =
            await this.prisma.chatMessage.count({
                where,
            });

        const summarizableMessageCount =
            unsummarizedMessageCount -
            RECENT_CONTEXT_MESSAGE_LIMIT;

        if (summarizableMessageCount <= 0) {
            return null;
        }

        const messages =
            await this.prisma.chatMessage.findMany({
                where,
                orderBy: {
                    id: 'asc',
                },
                take: Math.min(
                    summarizableMessageCount,
                    SUMMARY_MESSAGE_BATCH_LIMIT,
                ),
            });

        if (
            messages.at(-1)?.role ===
            ChatMessageRole.USER
        ) {
            messages.pop();
        }

        const throughMessageId =
            messages.at(-1)?.id;

        if (throughMessageId === undefined) {
            return null;
        }

        return {
            currentSummary: room.summary,
            messages,
            throughMessageId,
        };
    }

    async updateRoomTitleFromFirstMessage(roomId: number, userId: number, content: string): Promise<ChatRoom> {
        const room = await this.assertRoomOwner(roomId, userId);

        if (room.title !== '새 채팅') {
            return room;
        }

        const title = this.createRoomTitle(content);

        return this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                title,
                updatedAt: new Date(),
            },
        });
    }

    async deleteRoom(roomId: number, userId: number): Promise<void> {
        await this.assertRoomOwner(roomId, userId);

        await this.prisma.chatRoom.delete({
            where: {
                id: roomId,
            }
        });
    }

    async updateRoomTitle(roomId: number, userId: number, title: string): Promise<ChatRoom> {
        await this.assertRoomOwner(roomId, userId);

        const normalizedTitle = this.normalizeRoomTitle(title);

        return this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                title: normalizedTitle,
                updatedAt: new Date(),
            }
        });
    }

    async cancelGeneration(
        roomId: number,
        userId: number,
        userMessageId: number,
    ): Promise<ChatGenerationResult> {
        await this.assertRoomOwner(roomId, userId);

        const userMessage = await this.updateMessageStatus(
            userMessageId,
            ChatMessageStatus.CANCELLED,
        );


        const assistantMessage = await this.createMessage({
            roomId,
            role: ChatMessageRole.ASSISTANT,
            content: '[응답이 중단되었습니다.]',
            status: ChatMessageStatus.CANCELLED,
        });


        await this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                updatedAt: new Date(),
            },
        });

        return {
            userMessage,
            assistantMessage,
        };
    }

    async failGeneration(
        roomId: number,
        userId: number,
        userMessageId: number,
    ): Promise<ChatGenerationResult> {
        await this.assertRoomOwner(roomId, userId);

        const userMessage = await this.updateMessageStatus(
            userMessageId,
            ChatMessageStatus.FAILED,
        );

        const assistantMessage = await this.createMessage({
            roomId,
            role: ChatMessageRole.ASSISTANT,
            content: '[응답 생성에 실패했습니다.]',
            status: ChatMessageStatus.FAILED,
        });

        await this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                updatedAt: new Date(),
            },
        });

        return {
            userMessage,
            assistantMessage,
        };
    }


    private createRoomTitle(content: string): string {
        const normalized = content.replace(/\s+/g, ' ').trim();

        if (!normalized) {
            return '새 채팅';
        }

        if (normalized.length <= 30) {
            return normalized;
        }

        return `${normalized.slice(0, 30)}...`;
    }

    private async createMessage(params: {
        roomId: number;
        role: ChatMessageRole;
        content: string;
        status?: ChatMessageStatus;
    }): Promise<ChatMessage> {
        const message = await this.prisma.chatMessage.create({
            data: {
                roomId: params.roomId,
                role: params.role,
                content: params.content,
                status: params.status ?? ChatMessageStatus.COMPLETED,
            },
        });

        await this.touchRoomUpdatedAt(params.roomId);

        return message;
    }

    private async updateMessageStatus(
        messageId: number,
        status: ChatMessageStatus,
    ): Promise<ChatMessage> {
        return this.prisma.chatMessage.update({
            where: {
                id: messageId,
            },
            data: {
                status,
            },
        });
    }

    private async touchRoomUpdatedAt(roomId: number): Promise<ChatRoom> {
        return this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                updatedAt: new Date(),
            }
        })
    }

    private normalizeMessageContent(content: string): string {
        const normalized = content.trim();

        if (!normalized) {
            throw new BadRequestException('메시지를 입력해주세요.');
        }

        return normalized;
    }

    private normalizeRoomTitle(title: string): string {
        const normalized = title.replace(/\s+/g, ' ').trim();

        if (!normalized) {
            throw new BadRequestException('채팅방 제목을 입력해주세요.');
        }

        return normalized;
    }
}