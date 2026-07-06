import type { ChatMessageResponse, ChatRoomResponse, CreateChatRoomRequest } from "@repo/shared";
import { http } from "../../api/http";

export function createChatRoom(data: CreateChatRoomRequest) {
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

export function deleteChatRoom(roomId: number) {
    return  http<void>(`/chat/rooms/${roomId}`, {
        method: 'DELETE',
    })
}

export function updateChatRoomTitle(roomId: number, title: string) {
    return http<ChatRoomResponse>(`/chat/rooms/${roomId}`, {
        method: 'PATCH',
        body: {
            title,
        }
    });
}