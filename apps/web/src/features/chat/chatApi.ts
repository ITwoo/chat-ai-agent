import type { ChatMessageResponse, ChatRoomResponse, CreateChatRoomRequest } from "@repo/shared";
import { http } from "../../api/http";

export function createChatRoom(data: CreateChatRoomRequest){
    return http<ChatRoomResponse>('/chat/rooms', {
        method: 'POST',
        body: data,
    });
}

export function getChatRooms() {
    return http<ChatRoomResponse[]>('/chat/rooms');
}

export function getChatMessages(roomId: number) {
    return http<ChatMessageResponse[]>(`/chat/rooms/${roomId}/messages`)
}