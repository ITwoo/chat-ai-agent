import type { ChatMessagesPageResponse, ChatRoomResponse, CreateChatRoomRequest } from "@repo/shared";
import { http } from "../../api/http";

type GetChatMessagesParams = {
    cursor?: number | null;
    limit?: number;
};

export function createChatRoom(data: CreateChatRoomRequest) {
    return http<ChatRoomResponse>('/chat/rooms', {
        method: 'POST',
        body: data,
    });
}

export function getChatRooms() {
    return http<ChatRoomResponse[]>('/chat/rooms');
}

export function getChatMessages(
    roomId: number,
    params?: GetChatMessagesParams,
) {
    const searchParams = new URLSearchParams();

    if(params?.cursor) {
        searchParams.set('cursor', String(params.cursor));
    }

    if(params?.limit) {
        searchParams.set('limit', String(params.limit));
    }

    const queryString = searchParams.toString();
    
    return http<ChatMessagesPageResponse>(`/chat/rooms/${roomId}/messages${queryString ? `?${queryString}` : ''}`);
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