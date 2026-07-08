import type { ChatMessageResponse, ChatRoomResponse } from "@repo/shared";
import { useEffect, useRef, useState } from "react";
import { connectChatSocket, disconnectChatSocket } from "../features/chat/chatSocket";
import { createChatRoom, deleteChatRoom, getChatMessages, getChatRooms, updateChatRoomTitle } from "../features/chat/chatApi";
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
    const [isSending, setIsSending] = useState(false);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const selectedRoomIdRef = useRef<number | null>(null);
    const loadMessagesRequestIdRef = useRef(0);

    useEffect(() => {
        selectedRoomIdRef.current = room?.id ?? null;
    }, [room]);

    useEffect(() => {
        if (!errorMessage) {
            return;
        }

        const timerId = window.setTimeout(() => {
            setErrorMessage('');
        }, 3000);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [errorMessage]);

    useEffect(() => {
        const socket = connectChatSocket();

        const handleAnyEvent = (eventName: string, ...args: unknown[]) => {
            // console.log('[socket event]', eventName, args);
        };

        const handleConnect = () => {
            console.log('[socket connected]', socket.id);

            const currentRoomId = selectedRoomIdRef.current;

            if (!currentRoomId) {
                return;
            }

            socket.emit('join_room', {
                roomId: currentRoomId,
            });

            console.log('[socket emit] reconnect join_room', {
                roomId: currentRoomId,
            });
        };

        const handleDisconnect = (reason: string) => {
            console.log('[socket disconnected]', reason);
        };

        const handleMessageCreated = (message: ChatMessageResponse) => {

            if (message.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[message_created]', message);

            appendMessage(message);
        };

        const handleAssistantStarted = (data: { roomId: number }) => {
            if (data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[assistant_message_started]', data);

            setIsSending(false);
            setIsAssistantStreaming(true);
            setStreamingText('');
        };

        const handleAssistantDelta = (data: { roomId: number; delta: string }) => {
            if (data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[assistant_message_delta]', data);

            setStreamingText((prev) => prev + data.delta);
        };

        const handleAssistantCompleted = (data: {
            roomId: number;
            message: ChatMessageResponse;
        }) => {
            if (data.roomId !== selectedRoomIdRef.current) {
                loadRooms();
                return;
            }

            console.log('[assistant_message_completed]', data);

            setIsSending(false);
            setIsAssistantStreaming(false);
            setStreamingText('');

            appendMessage(data.message);

            loadRooms();
        };

        const handleChatError = (error: { message: string }) => {
            console.error('[chat_error]', error);

            setIsSending(false);
            setIsAssistantStreaming(false);
            setStreamingText('');

            setErrorMessage(error.message);

        };

        const handleChatRoomUpdated = (updatedRoom: ChatRoomResponse) => {
            console.log('[chat_room_updated]', updatedRoom);

            setRooms((prev) => [
                updatedRoom,
                ...prev.filter((room) => room.id !== updatedRoom.id),
            ]);

            setRoom((prev) =>
                prev?.id === updatedRoom.id ? updatedRoom : prev,
            );
        }

        const handleAssistantCancelled = (data: { roomId: number; message?: ChatMessageResponse; }) => {
            if (data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[assistant_message_cancelled]', data);

            setIsSending(false);
            setIsAssistantStreaming(false);
            setStreamingText('');

            const cancelledMessage = data.message;

            if (!cancelledMessage) {
                return;
            }

            appendMessage(cancelledMessage);
        }

        const handleMessageUpdated = (updatedMessage: ChatMessageResponse) => {
            if (updatedMessage.roomId !== selectedRoomIdRef.current) {
                return;
            }

            upsertMessage(updatedMessage);
        }

        const handleAssistantFailed = (data: {
            roomId: number;
            message: ChatMessageResponse
        }) => {
            if (data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            setIsSending(false);
            setIsAssistantStreaming(false);
            setStreamingText('');

            appendMessage(data.message);
        };

        socket.onAny(handleAnyEvent);

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('message_created', handleMessageCreated);
        socket.on('message_updated', handleMessageUpdated);
        socket.on('chat_room_updated', handleChatRoomUpdated)
        socket.on('assistant_message_started', handleAssistantStarted);
        socket.on('assistant_message_delta', handleAssistantDelta);
        socket.on('assistant_message_completed', handleAssistantCompleted);
        socket.on('assistant_message_cancelled', handleAssistantCancelled);
        socket.on('assistant_message_failed', handleAssistantFailed);
        socket.on('chat_error', handleChatError);

        return () => {
            socket.offAny(handleAnyEvent);

            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('message_created', handleMessageCreated);
            socket.off('message_updated', handleMessageUpdated);
            socket.off('chat_room_updated', handleChatRoomUpdated)
            socket.off('assistant_message_started', handleAssistantStarted);
            socket.off('assistant_message_delta', handleAssistantDelta);
            socket.off('assistant_message_completed', handleAssistantCompleted);
            socket.off('assistant_message_cancelled', handleAssistantCancelled);
            socket.off('assistant_message_failed', handleAssistantFailed);
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
            setErrorMessage('먼저 채팅방을 만들어야 합니다.');
            return;
        }

        if (isSending || isAssistantStreaming) {
            return;
        }

        if (!content.trim()) {
            setErrorMessage('메시지를 입력해주세요.');
            return;
        }

        const socket = connectChatSocket();

        const payload = {
            roomId: room.id,
            content: content,
        };

        setErrorMessage('');
        setIsSending(true);

        console.log('[socket emit] send_message', payload);

        socket.emit('send_message', payload);

        moveRoomToTop(room.id);

        setContent('');
    };

    const handleRetryMessage = (message: ChatMessageResponse) => {
        if (!room) {
            setErrorMessage('먼저 채팅방을 선택해야 합니다.');
            return;
        }

        if (isSending || isAssistantStreaming || isMessagesLoading) {
            return;
        }

        const retryContent = message.content.trim();

        if (!retryContent) {
            setErrorMessage('재시도할 메시지가 없습니다.');
            return;
        }

        const socket = connectChatSocket();

        const payload = {
            roomId: room.id,
            content: retryContent,
        };

        setErrorMessage('');
        setIsSending(true);
        setStreamingText('');

        console.log('[socket emit] retry send_message', payload);

        socket.emit('send_message', payload);

        moveRoomToTop(room.id);
    }

    const loadRooms = async () => {
        const rooms = await getChatRooms();
        setRooms(rooms);
    }

    const enterRoom = async (targetRoom: ChatRoomResponse) => {
        const socket = connectChatSocket();

        const previousRoomId = selectedRoomIdRef.current;

        if (previousRoomId && previousRoomId !== targetRoom.id) {
            socket.emit('leave_room', {
                roomId: previousRoomId,
            });
        }

        setRoom(targetRoom);
        selectedRoomIdRef.current = targetRoom.id;

        setMessages([]);
        setStreamingText('');
        setIsSending(false);
        setIsAssistantStreaming(false);
        setIsMessagesLoading(true);

        socket.emit('join_room', {
            roomId: targetRoom.id,
        });

        const requestId = loadMessagesRequestIdRef.current + 1;
        loadMessagesRequestIdRef.current = requestId;

        try {
            const messages = await getChatMessages(targetRoom.id);

            if (requestId !== loadMessagesRequestIdRef.current) {
                return;
            }

            if (selectedRoomIdRef.current !== targetRoom.id) {
                return;
            }

            setMessages(messages);
        } finally {
            if (requestId === loadMessagesRequestIdRef.current && selectedRoomIdRef.current === targetRoom.id) {
                setIsMessagesLoading(false);
            }
        }
    };

    const handleDeleteRoom = async (targetRoom: ChatRoomResponse) => {
        const ok = window.confirm(`"${targetRoom.title}" 채팅방을 삭제할까요?`);

        if (!ok) {
            return;
        }

        const socket = connectChatSocket();

        const isCurrentRoom = room?.id === targetRoom.id;

        if (isCurrentRoom) {
            if (isAssistantStreaming || isSending) {
                socket.emit('stop_generation', {
                    roomId: targetRoom.id,
                });
            }

            socket.emit('leave_room', {
                roomId: targetRoom.id,
            });
        }

        await deleteChatRoom(targetRoom.id);

        setRooms((prev) => prev.filter((room) => room.id !== targetRoom.id));

        if (isCurrentRoom) {
            loadMessagesRequestIdRef.current += 1;

            setRoom(null);
            selectedRoomIdRef.current = null;

            setMessages([]);
            setContent('');
            setStreamingText('');
            setIsSending(false);
            setIsAssistantStreaming(false);
            setIsMessagesLoading(false);
        }
    };

    const handleEditRoom = async (targetRoom: ChatRoomResponse) => {
        const title = window.prompt('채팅방 제목을 입력하세요.', targetRoom.title);

        if (title === null) {
            return;
        }

        if (!title.trim()) {
            setErrorMessage('제목을 입력해주세요.');
            return;
        }

        setErrorMessage('');


        const updatedRoom = await updateChatRoomTitle(targetRoom.id, title.trim());

        setRooms(
            (prev) => prev.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)),
        );

        setRoom((prev) => (prev?.id === updatedRoom.id ? updatedRoom : prev));

    }

    const moveRoomToTop = (targetRoomId: number) => {
        setRooms((prev) => {
            const targetRoom = prev.find((room) => room.id === targetRoomId);

            if (!targetRoom) {
                return prev;
            }

            return [
                targetRoom,
                ...prev.filter((room) => room.id !== targetRoomId),
            ];
        });
    };

    const handleStopGeneration = () => {
        if (!room) {
            return;
        }

        const socket = connectChatSocket();

        socket.emit('stop_generation', {
            roomId: room.id,
        });

        setIsSending(false);
        setIsAssistantStreaming(false);
        setStreamingText('');

    }

    const appendMessage = (message: ChatMessageResponse) => {
        setMessages((prev) => {
            const exists = prev.some((prevMessage) => prevMessage.id === message.id);

            if (exists) {
                return prev;
            }

            return [...prev, message];
        });
    };

    const upsertMessage = (message: ChatMessageResponse) => {
        setMessages((prev) => {
            const exists = prev.some((prevMessage) => prevMessage.id === message.id);

            if (!exists) {
                return [...prev, message];
            }

            return prev.map((prevMessage) => prevMessage.id === message.id ? message : prevMessage);
        })
    }

    return (
        <div className="mx-auto grid h-[calc(100vh-96px)] max-w-6xl grid-cols-[280px_1fr] gap-6 px-6 py-6">
            <ChatRoomSidebar
                rooms={rooms}
                selectedRoomId={room?.id}
                onCreateRoom={handleCreateRoom}
                onEnterRoom={enterRoom}
                onDeleteRoom={handleDeleteRoom}
                onEditRoom={handleEditRoom}
            />

            <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
                <header className="shrink-0 border-b px-6 py-4">
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

                {errorMessage && (
                    <div className="shrink-0 px-6 pt-4">
                        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            <p>{errorMessage}</p>

                            <button
                                type="button"
                                onClick={() => setErrorMessage('')}
                                className="shrink-0 text-xs font-semibold text-red-500 hover:text-red-700"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                )}
                
                <ChatMessageList
                    room={room}
                    messages={messages}
                    isAssistantStreaming={isAssistantStreaming}
                    streamingText={streamingText}
                    isLoading={isMessagesLoading}
                    onRetryMessage={handleRetryMessage}
                    isRetryDisabled={isSending || isAssistantStreaming || isMessagesLoading}
                />

                <ChatInput
                    value={content}
                    disabled={!room || isSending || isAssistantStreaming || isMessagesLoading}
                    isAssistantStreaming={isAssistantStreaming}
                    onChange={setContent}
                    onSend={handleSendMessage}
                    onStop={handleStopGeneration}
                />
            </main>
        </div>
    );
}           