import type { ChatMessageResponse, ChatRoomResponse } from "@repo/shared";
import { useEffect, useRef, useState } from "react";
import { connectChatSocket, disconnectChatSocket } from "../features/chat/chatSocket";
import { createChatRoom, deleteChatRoom, getChatMessages, getChatRooms, updateChatRoomTitle } from "../features/chat/chatApi";
import { ChatRoomSidebar } from "../features/chat/components/ChatRoomSidebar";
import { ChatMessageList } from "../features/chat/components/ChatMessageList";
import { ChatInput } from "../features/chat/components/ChatInput";
import type { PendingAgentApproval, AgentApprovalResolvedEvent, AgentApprovalAction } from "../features/chat/types/agentApproval";
import { AgentApprovalCard } from "../features/chat/components/AgentApprovalCard";

const MESSAGE_PAGE_SIZE = 10;

export function ChatPage() {
    const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
    const [room, setRoom] = useState<ChatRoomResponse | null>(null);
    const [content, setContent] = useState('');
    const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const [isSending, setIsSending] = useState(false);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const [isAssistantStreaming, setIsAssistantStreaming] = useState(false);
    const [isRoomsLoading, setIsRoomsLoading] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const [nextMessageCursor, setNextMessageCursor] = useState<number | null>(null);
    const [isOlderMessagesLoading, setIsOlderMessagesLoading] = useState(false);

    const [pendingApproval, setPendingApproval] = useState<PendingAgentApproval | null>(null);

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
        if (!isMobileSidebarOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMobileSidebarOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMobileSidebarOpen]);

    useEffect(() => {
        const socket = connectChatSocket();

        const handleAnyEvent = (eventName: string, ...args: unknown[]) => {
            console.log('[socket event]', eventName, args);
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
            setPendingApproval(null);

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
            setPendingApproval(null);

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
            setPendingApproval(null);

            appendMessage(data.message);
        };

        const handleAssistantApprovalRequired = (
            data: PendingAgentApproval,
        ) => {
            if(data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[assistant_approval_required]', data);

            setIsSending(false);
            setIsAssistantStreaming(false);
            setStreamingText('');
            setErrorMessage('');

            setPendingApproval(data);
        };

        const handleAssistantApprovalResolved = (
            data: AgentApprovalResolvedEvent,
        ) => {
            if(data.roomId !== selectedRoomIdRef.current) {
                return;
            }

            console.log('[assistant_approval_resolved]', data);

            setPendingApproval((current) => {
                if (!current) {
                    return current;
                }

                const isSameApproval =
                    current.roomId === data.roomId &&
                    current.userMessageId === data.userMessageId &&
                    current.approvalId === data.approvalId;

                return isSameApproval ? null : current;
            });

            setIsSending(false);
        }
        

        socket.onAny(handleAnyEvent);

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('message_created', handleMessageCreated);
        socket.on('message_updated', handleMessageUpdated);
        socket.on('chat_room_updated', handleChatRoomUpdated)
        socket.on('assistant_message_started', handleAssistantStarted);
        socket.on('assistant_message_delta', handleAssistantDelta);
        socket.on('assistant_approval_required', handleAssistantApprovalRequired);
        socket.on('assistant_approval_resolved', handleAssistantApprovalResolved);
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
            socket.off('assistant_approval_required', handleAssistantApprovalRequired);
            socket.off('assistant_approval_resolved', handleAssistantApprovalResolved);
            socket.off('assistant_message_completed', handleAssistantCompleted);
            socket.off('assistant_message_cancelled', handleAssistantCancelled);
            socket.off('assistant_message_failed', handleAssistantFailed);
            socket.off('chat_error', handleChatError);

            disconnectChatSocket();
        };
    }, []);

    useEffect(() => {
        loadRooms({ showLoading: true });
    }, []);

    const handleCreateRoom = async () => {

        try {
            setErrorMessage('');

            const createdRoom = await createChatRoom({
                title: '새 채팅',
            });

            await loadRooms();
            await enterRoom(createdRoom);

            closeMobileSidebar();
        } catch (error) {
            console.error('[createRoom error]', error);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : '채팅방을 생성하지 못했습니다.',
            );
        }
    };

    const handleApprovalResponse = (
        action: AgentApprovalAction,
    ) => {
        if(!pendingApproval) {
            setErrorMessage('대기 중인 승인 요청이 없습니다.');
            return;
        }

        if(isSending || isAssistantStreaming) {
            return;
        }

        const socket = connectChatSocket();

        const payload = {
            roomId: pendingApproval.roomId,
            approvalId: pendingApproval.approvalId,
            userMessageId: pendingApproval.userMessageId,
            action,
        };

        setErrorMessage('');
        setIsSending(true);

        console.log('[socket emit] respond_agent_approval', payload);

        socket.emit('respond_agent_approval', payload);
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

    const loadRooms = async (options?: { showLoading?: boolean }) => {
        const showLoading = options?.showLoading ?? false;

        if (showLoading) {
            setIsRoomsLoading(true);
        }
        try {
            const rooms = await getChatRooms();
            setRooms(rooms);
        } catch (error) {
            console.error('[loadrooms error]', error);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : '채팅방 목록을 불러오지 못했습니다.',
            );
        } finally {
            if (showLoading) {
                setIsRoomsLoading(false);
            }
        }
    }

    const enterRoom = async (targetRoom: ChatRoomResponse) => {
        closeMobileSidebar();

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
        setNextMessageCursor(null);
        setIsOlderMessagesLoading(false);
        setPendingApproval(null);

        socket.emit('join_room', {
            roomId: targetRoom.id,
        });

        const requestId = loadMessagesRequestIdRef.current + 1;
        loadMessagesRequestIdRef.current = requestId;

        try {
            const messagesPage = await getChatMessages(targetRoom.id, {
                limit: MESSAGE_PAGE_SIZE,
            });

            if (requestId !== loadMessagesRequestIdRef.current) {
                return;
            }

            if (selectedRoomIdRef.current !== targetRoom.id) {
                return;
            }

            setMessages(messagesPage.messages);
            setNextMessageCursor(messagesPage.nextCursor);

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

        closeMobileSidebar();

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
            setNextMessageCursor(null);
            setIsOlderMessagesLoading(false);
            setPendingApproval(null);
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

    const handleLoadOlderMessages = async () => {
        if (!room) {
            return;
        }

        if (!nextMessageCursor) {
            return;
        }

        if (isOlderMessagesLoading || isMessagesLoading) {
            return;
        }

        const requestRoomId = room.id;
        const cursor = nextMessageCursor;

        setIsOlderMessagesLoading(true);

        try {
            const messagesPage = await getChatMessages(requestRoomId, {
                cursor,
                limit: MESSAGE_PAGE_SIZE,
            });

            if (selectedRoomIdRef.current !== requestRoomId) {
                return;
            }

            setMessages((prev) => {
                const existingIds = new Set(prev.map((message) => message.id));

                const olderMessages = messagesPage.messages.filter(
                    (messages) => !existingIds.has(messages.id),
                );

                return [...olderMessages, ...prev];
            });

            setNextMessageCursor(messagesPage.nextCursor);
        } catch (error) {
            console.error('[loadOlderMessages error]', error);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : '이전 메시지를 불러오지 못했습니다.',
            );
        } finally {
            if (selectedRoomIdRef.current === requestRoomId) {
                setIsOlderMessagesLoading(false);
            }
        }
    };

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

    const closeMobileSidebar = () => {
        setIsMobileSidebarOpen(false);
    };

    return (
        <div className="mx-auto grid h-[calc(100dvh-96px)] max-w-6xl grid-cols-1 gap-4 bg-slate-50 px-4 py-4 md:grid-cols-[280px_minmax(0,1fr)] md:gap-6 md:px-6 md:py-6">
            {isMobileSidebarOpen && (
                <button
                    type="button"
                    aria-label="채팅방 목록 닫기"
                    onClick={closeMobileSidebar}
                    className="fixed inset-0 z-40 bg-black/40 md:hidden"
                />
            )}
            <ChatRoomSidebar
                rooms={rooms}
                selectedRoomId={room?.id}
                isLoading={isRoomsLoading}
                className={`fixed bottom-0 left-0 top-0 z-50 w-80 max-w-[85vw] rounded-none transition-transform duration-200 md:static md:z-auto md:w-auto md:max-w-none md:rounded-2xl md:transition-none
                    ${isMobileSidebarOpen
                        ? 'translate-x-0'
                        : '-translate-x-full md:translate-x-0'
                    }`}
                onCreateRoom={handleCreateRoom}
                onEnterRoom={enterRoom}
                onDeleteRoom={handleDeleteRoom}
                onEditRoom={handleEditRoom}
            />

            <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur md:px-6">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => setIsMobileSidebarOpen(true)}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 md:hidden"
                        >
                            채팅방
                        </button>

                        <div className="min-w-0 flex-1">
                            {room ? (
                                <>
                                    <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl">
                                        {room.title}
                                    </h1>

                                    <p className="mt-1 text-xs text-slate-400">
                                        roomId: {room.id}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h1 className="text-lg font-bold text-slate-900 md:text-xl">
                                        AI 채팅
                                    </h1>

                                    <p className="mt-1 text-sm text-slate-500">
                                        채팅방을 선택하거나 새 채팅을 만들어주세요.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {errorMessage && (
                    <div className="shrink-0 px-4 pt-4 md:px-6">
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
                    hasOlderMessages={nextMessageCursor !== null}
                    isOlderMessagesLoading={isOlderMessagesLoading}
                    onLoadOlderMessages={handleLoadOlderMessages}
                    onRetryMessage={handleRetryMessage}
                    isRetryDisabled={isSending || isAssistantStreaming || isMessagesLoading || pendingApproval !== null}
                />

                {
                    pendingApproval && (
                        <AgentApprovalCard
                            approval={pendingApproval}
                            disabled={
                                isSending ||
                                isAssistantStreaming
                            }
                            onRespond={handleApprovalResponse}
                        />
                    )
                }

                <ChatInput
                    value={content}
                    disabled={!room || isSending || isAssistantStreaming || isMessagesLoading}
                    isAssistantStreaming={isAssistantStreaming}
                    onChange={setContent}
                    onSend={handleSendMessage}
                    onStop={handleStopGeneration}
                />
            </main>
        </div >
    );
}