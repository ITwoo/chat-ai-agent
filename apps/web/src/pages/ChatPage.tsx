import type { ChatMessageResponse, ChatRoomResponse } from "@repo/shared";
import { useEffect, useState } from "react";
import { connectChatSocket, disconnectChatSocket } from "../features/chat/chatSocket";
import { createChatRoom, getChatMessages, getChatRooms } from "../features/chat/chatApi";
import { ChatRoomSidebar } from "../features/chat/components/ChatRoomSidebar";
import { ChatMessageList } from "../features/chat/components/ChatMessageList";
import { ChatInput } from "../features/chat/components/ChatInput";

export function ChatPage() {
    const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
    const [room, setRoom] = useState<ChatRoomResponse | null>(null);
    const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [isAssistantStreaming, setIsAssistantStreaming] = useState(false);
    const [content, setContent] = useState('');

    useEffect(() => {
        const socket = connectChatSocket();

        const handleAnyEvent = (eventName: string, ...args: unknown[]) => {
            console.log('[socket event]', eventName, args);
        };

        const handleConnect = () => {
            console.log('[socket connected]', socket.id);
        };

        const handleDisconnect = (reason: string) => {
            console.log('[socket disconnected]', reason);
        };

        const handleMessageCreated = (message: ChatMessageResponse) => {
            console.log('[message_created]', message);

            setMessages((prev) => [...prev, message]);
        };

        const handleAssistantStarted = (data: { roomId: number }) => {
            console.log('[assistant_message_started]', data);

            setIsAssistantStreaming(true);
            setStreamingText('');
        };

        const handleAssistantDelta = (data: { roomId: number; delta: string }) => {
            console.log('[assistant_message_delta]', data);

            setStreamingText((prev) => prev + data.delta);
        };

        const handleAssistantCompleted = (data: {
            roomId: number;
            message: ChatMessageResponse;
        }) => {
            console.log('[assistant_message_completed]', data);

            setIsAssistantStreaming(false);
            setStreamingText('');

            setMessages((prev) => [...prev, data.message]);
        };

        const handleChatError = (error: { message: string }) => {
            console.error('[chat_error]', error);
            alert(error.message);
        };

        const handleChatRoomUpdated = (updatedRoom: ChatRoomResponse) => {
            console.log('[chat_room_updated]', updatedRoom);

            setRooms((prev) =>
                prev.map((room) =>
                    room.id === updatedRoom.id ? updatedRoom : room,
                ),
            );

            setRoom((prev) =>
                prev?.id === updatedRoom.id ? updatedRoom : prev,
            );
        }


        socket.onAny(handleAnyEvent);

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('message_created', handleMessageCreated);
        socket.on('chat_room_updated', handleChatRoomUpdated)
        socket.on('assistant_message_started', handleAssistantStarted);
        socket.on('assistant_message_delta', handleAssistantDelta);
        socket.on('assistant_message_completed', handleAssistantCompleted);
        socket.on('chat_error', handleChatError);

        return () => {
            socket.offAny(handleAnyEvent);

            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('message_created', handleMessageCreated);
            socket.off('chat_room_updated', handleChatRoomUpdated)
            socket.off('assistant_message_started', handleAssistantStarted);
            socket.off('assistant_message_delta', handleAssistantDelta);
            socket.off('assistant_message_completed', handleAssistantCompleted);
            socket.off('chat_error', handleChatError);

            disconnectChatSocket();
        };
    }, []);

    useEffect(() => {
        loadRooms();
    }, []);

    const handleCreateRoom = async () => {
        const createdRoom = await createChatRoom({
            title: '새 채팅',
        });

        await loadRooms();
        await enterRoom(createdRoom);
    };

    const handleSendMessage = async () => {
        if (!room) {
            alert('먼저 채팅방을 만들어야 합니다.');
            return;
        }

        if (!content.trim()) {
            alert('메시지를 입력해주세요.');
            return;
        }

        const socket = connectChatSocket();

        const payload = {
            roomId: room.id,
            content: content,
        };

        console.log('[socket emit] send_message', payload);

        socket.emit('send_message', payload);

        setContent('');
    };

    const loadRooms = async () => {
        const rooms = await getChatRooms();
        setRooms(rooms);
    }

    const enterRoom = async (targetRoom: ChatRoomResponse) => {
        const socket = connectChatSocket();

        setRoom(targetRoom);
        setStreamingText('');
        setIsAssistantStreaming(false);

        const messages = await getChatMessages(targetRoom.id);
        setMessages(messages);

        socket.emit('join_room', {
            roomId: targetRoom.id,
        });
    };

    return (
        <div className="mx-auto grid max-w-6xl grid-cols-[280px_1fr] gap-6 px-6 py-10">
            <ChatRoomSidebar
                rooms={rooms}
                selectedRoomId={room?.id}
                onCreateRoom={handleCreateRoom}
                onEnterRoom={enterRoom}
            />

            <main className="flex min-h-[720px] flex-col rounded-2xl border bg-white shadow-sm">
                <header className="border-b px-6 py-4">
                    {room ? (
                        <>
                            <h1 className="text-xl font-bold">{room.title}</h1>
                            <p className="mt-1 text-sm text-gray-500">roomId: {room.id}</p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl font-bold">AI 채팅</h1>
                            <p className="mt-1 text-sm text-gray-500">
                                왼쪽에서 채팅방을 선택하거나 새 채팅을 만들어주세요.
                            </p>
                        </>
                    )}
                </header>

                <ChatMessageList
                    room={room}
                    messages={messages}
                    isAssistantStreaming={isAssistantStreaming}
                    streamingText={streamingText}
                />

                <ChatInput
                    value={content}
                    disabled={!room || isAssistantStreaming}
                    onChange={setContent}
                    onSend={handleSendMessage}
                />
            </main>
        </div>
    );
}           