import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { JwtGuard } from '../auth/guard/jwt.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';
import type { User } from '../generated/prisma/client';
import { UpdateChatRoomDto } from './dto/update-chat-room.dto';
import { GetChatMessagesQueryDto } from './dto/get-chat-messages-query.dto';

@Controller('chat')
@UseGuards(JwtGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post('rooms')
    createRoom(
        @GetUser() user: User,
        @Body() createChatRoomDto: CreateChatRoomDto,
    ) {
        return this.chatService.createRoom(user, createChatRoomDto.title);
    }

    @Get('rooms')
    getRooms(@GetUser() user: User) {
        return this.chatService.getRooms(user);
    }

    @Get('rooms/:roomId/messages')
    getMessages(
        @Param('roomId', ParseIntPipe) roomId: number,
        @GetUser() user: User,
        @Query() query: GetChatMessagesQueryDto,
    ) {
        return this.chatService.getMessages(roomId, user, {
            cursor: query.cursor,
            limit: query.limit,
        });
    }

    @Patch('rooms/:roomId')
    updateRoomTitle(
        @Param('roomId', ParseIntPipe) roomId: number,
        @GetUser() user: User,
        @Body() updateChatRoomDto: UpdateChatRoomDto,
    ){
        return this.chatService.updateRoomTitle(
            roomId,
            user.id,
            updateChatRoomDto.title,
        );
    }

    @Delete('rooms/:roomId')
    deleteRoom(
        @Param('roomId', ParseIntPipe) roomId: number,
        @GetUser() user: User,
    ){
        return this.chatService.deleteRoom(roomId, user.id);
    }
}