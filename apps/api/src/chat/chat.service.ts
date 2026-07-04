import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageRole } from '../generated/prisma/client';

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
}