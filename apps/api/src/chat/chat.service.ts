import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageRole } from '../generated/prisma/client';
import { ChatMessageStatus } from '@repo/shared';

type ChatUser = {
    id: number;
    username: string;
}
@Injectable()
export class ChatService {
    constructor(private readonly prisma: PrismaService) { }

    async createRoom(user: ChatUser, title?: string) {
        return this.prisma.chatRoom.create({
            data: {
                title: title?.trim() || '새 채팅',
                userId: user.id,
            },
        });
    }

    async getRooms(user: ChatUser) {
        return this.prisma.chatRoom.findMany({
            where: {
                userId: user.id,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });
    }

    async getMessages(roomId: number, user: ChatUser) {
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

    async saveUserMessage(roomId: number, user: ChatUser, content: string) {
        await this.assertRoomOwner(roomId, user.id);

        const message = await this.prisma.chatMessage.create({
            data: {
                roomId,
                role: ChatMessageRole.USER,
                content,
            },
        });

        await this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                updatedAt: new Date(),
            },
        });

        return message;
    }

    async assertRoomOwner(roomId: number, userId: number) {
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

    async saveAssistantMessage(roomId: number, userId: number, content: string) {
        await this.assertRoomOwner(roomId, userId);

        const message = await this.prisma.chatMessage.create({
            data: {
                roomId,
                role: ChatMessageRole.ASSISTANT,
                content,
            },
        });

        await this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                updatedAt: new Date(),
            },
        });

        return message;
    }

    async getRecentMessages(roomId: number, userId: number) {
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

    async updateRoomTitleFromFirstMessage(roomId: number, userId: number, content: string) {
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
        })
    }

    async updateRoomTitle(roomId: number, userId: number, title: string) {
        await this.assertRoomOwner(roomId, userId);

        return  this.prisma.chatRoom.update({
            where: {
                id: roomId,
            },
            data: {
                title: title.trim(),
                updatedAt: new Date(),
            }
        })
    }

    async cancelGeneration(
        roomId: number,
        userId: number,
        userMessageId: number,
    ) {
        await this.assertRoomOwner(roomId, userId);

        const userMessage = await this.prisma.chatMessage.update({
            where: {
                id: userMessageId,
            },
            data: {
                status: ChatMessageStatus.CANCELLED,
            },
        });

        const assistantMessage = await this.prisma.chatMessage.create({
            data: {
                roomId,
                role: ChatMessageRole.ASSISTANT,
                content: '[응답이 중단되었습니다.]',
                status: ChatMessageStatus.CANCELLED,
            },
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


    private createRoomTitle(content: string){
        const normalized = content.replace(/\s+/g, ' ').trim();

        if(!normalized) {
            return '새 채팅';
        }

        if(normalized.length <= 30) {
            return normalized;
        }

        return `${normalized.slice(0, 30)}...`;
    }
}