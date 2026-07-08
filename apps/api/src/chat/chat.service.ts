import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessage, ChatMessageRole, ChatMessageStatus, ChatRoom } from '../generated/prisma/client';

type ChatUser = {
    id: number;
    username: string;
}

type ChatGenerationResult = {
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
}

const RECENT_CONTEXT_MESSAGE_LIMIT = 20;
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

    async getMessages(roomId: number, user: ChatUser): Promise<ChatMessage[]> {
        await this.assertRoomOwner(roomId, user.id);

        return this.prisma.chatMessage.findMany({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    async saveUserMessage(roomId: number, user: ChatUser, content: string): Promise<ChatMessage> {
        await this.assertRoomOwner(roomId, user.id);

        const userMessage = await this.createMessage({
            roomId,
            role: ChatMessageRole.USER,
            content,
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

    async saveAssistantMessage(roomId: number, userId: number, assistantContent: string): Promise<ChatMessage> {
        await this.assertRoomOwner(roomId, userId);

        const assistantMessage = await this.createMessage({
            roomId,
            role: ChatMessageRole.ASSISTANT,
            content: assistantContent
        });        

        return assistantMessage;
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
            take: 20,
        });

        return messages.reverse();
    }

    async updateRoomTitleFromFirstMessage(roomId: number, userId: number, content: string): Promise<ChatRoom> {
        const room = await this.assertRoomOwner(roomId, userId);

        if(room.title !== '새 채팅') {
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

    async deleteRoom(roomId: number,  userId: number): Promise<void> {
        await this.assertRoomOwner(roomId, userId);

        await this.prisma.chatRoom.delete({
            where: {
                id: roomId,
            }
        });
    }

    async updateRoomTitle(roomId: number, userId: number, title: string): Promise<ChatRoom> {
        await this.assertRoomOwner(roomId, userId);

        return  this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                title: title.trim(),
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
                id:  roomId,
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

        if(!normalized) {
            return '새 채팅';
        }

        if(normalized.length <= 30) {
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
}