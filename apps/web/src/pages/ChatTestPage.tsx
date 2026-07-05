import type { ChatMessageResponse, ChatRoomResponse } from "@repo/shared";
import { useEffect, useState } from "react";
import { connectChatSocket, disconnectChatSocket } from "../features/chat/chatSocket";
import { createChatRoom, getChatMessages, getChatRooms } from "../features/chat/chatApi";

export function ChatTestPage() {
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

        socket.onAny(handleAnyEvent);

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('message_created', handleMessageCreated);
        socket.on('assistant_message_started', handleAssistantStarted);
        socket.on('assistant_message_delta', handleAssistantDelta);
        socket.on('assistant_message_completed', handleAssistantCompleted);
        socket.on('chat_error', handleChatError);

        return () => {
            socket.offAny(handleAnyEvent);

            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('message_created', handleMessageCreated);
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
            <aside className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">채팅방</h2>

                    <button
                        onClick={handleCreateRoom}
                        className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
                    >
                        새 채팅
                    </button>
                </div>

                <div className="space-y-2">
                    {rooms.length === 0 && (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                            아직 채팅방이 없습니다.
                        </div>
                    )}

                    {rooms.map((chatRoom) => (
                        <button
                            key={chatRoom.id}
                            onClick={() => enterRoom(chatRoom)}
                            className={`block w-full rounded-xl border px-3 py-3 text-left transition ${room?.id === chatRoom.id
                                    ? 'border-gray-900 bg-gray-900 text-white'
                                    : 'bg-white hover:bg-gray-50'
                                }`}
                        >
                            <p className="truncate text-sm font-semibold">
                                {chatRoom.title}
                            </p>

                            <p
                                className={`mt-1 text-xs ${room?.id === chatRoom.id ? 'text-gray-300' : 'text-gray-500'
                                    }`}
                            >
                                roomId: {chatRoom.id}
                            </p>
                        </button>
                    ))}
                </div>
            </aside>

            <main className="flex min-h-[720px] flex-col rounded-2xl border bg-white shadow-sm">
                <header className="border-b px-6 py-4">
                    {room ? (
                        <>
                            <h1 className="text-xl font-bold">{room.title}</h1>
                            <p className="mt-1 text-sm text-gray-500">roomId: {room.id}</p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl font-bold">채팅 테스트</h1>
                            <p className="mt-1 text-sm text-gray-500">
                                왼쪽에서 채팅방을 선택하거나 새 채팅을 만들어주세요.
                            </p>
                        </>
                    )}
                </header>

                <section className="flex-1 space-y-4 overflow-y-auto bg-gray-50 px-6 py-6">
                    {!room && (
                        <div className="flex h-full items-center justify-center text-gray-500">
                            채팅방을 선택하면 메시지가 표시됩니다.
                        </div>
                    )}

                    {room && messages.length === 0 && !isAssistantStreaming && (
                        <div className="flex h-full items-center justify-center text-gray-500">
                            아직 메시지가 없습니다. 첫 메시지를 보내보세요.
                        </div>
                    )}

                    {messages.map((message) => {
                        const isUser = message.role === 'USER';

                        return (
                            <div
                                key={message.id}
                                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${isUser
                                            ? 'bg-gray-900 text-white'
                                            : 'border bg-white text-gray-900'
                                        }`}
                                >
                                    <p
                                        className={`mb-1 text-xs font-semibold ${isUser ? 'text-gray-300' : 'text-gray-500'
                                            }`}
                                    >
                                        {message.role}
                                    </p>

                                    <p className="whitespace-pre-wrap text-sm leading-6">
                                        {message.content}
                                    </p>
                                </div>
                            </div>
                        );
                    })}

                    {isAssistantStreaming && (
                        <div className="flex justify-start">
                            <div className="max-w-[75%] rounded-2xl border bg-white px-4 py-3 text-gray-900">
                                <p className="mb-1 text-xs font-semibold text-gray-500">
                                    ASSISTANT
                                </p>

                                <p className="whitespace-pre-wrap text-sm leading-6">
                                    {streamingText || '생각 중...'}
                                </p>
                            </div>
                        </div>
                    )}
                </section>

                <footer className="border-t bg-white px-6 py-4">
                    <div className="flex gap-3">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            disabled={!room || isAssistantStreaming}
                            className="min-h-[48px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:border-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                            placeholder={
                                room
                                    ? '메시지를 입력하세요. Shift + Enter로 줄바꿈'
                                    : '먼저 채팅방을 선택해주세요.'
                            }
                        />

                        <button
                            onClick={handleSendMessage}
                            disabled={!room || isAssistantStreaming}
                            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            전송
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
}           