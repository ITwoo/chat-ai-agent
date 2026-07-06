import type { ChatMessageResponse, ChatRoomResponse } from '@repo/shared';
import { useEffect, useRef } from 'react';

type ChatMessageListProps = {
    room: ChatRoomResponse | null;
    messages: ChatMessageResponse[];
    isAssistantStreaming: boolean;
    streamingText: string;
};

export function ChatMessageList({
    room,
    messages,
    isAssistantStreaming,
    streamingText,
}: ChatMessageListProps) {

    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: 'smooth',
        });
    }, [messages, streamingText, isAssistantStreaming]);

    if (!room) {
        return (
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-6 py-6">
                <div className="flex min-h-full items-center justify-center text-gray-500">
                    채팅방을 선택하면 메시지가 표시됩니다.
                </div>
            </section>
        );
    }

    if (messages.length === 0 && !isAssistantStreaming) {
        return (
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-6 py-6">
                <div className="flex min-h-full items-center justify-center text-gray-500">
                    아직 메시지가 없습니다. 첫 메시지를 보내보세요.
                </div>
            </section>
        );
    }

    return (
        <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 px-6 py-6">
            {messages.map((message) => {
                const isUser = message.role === 'USER';
                const isCancelled = message.status === 'CANCELLED';

                return (
                    <div
                        key={message.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[75%] rounded-2xl px-4 py-3 ${isUser
                                    ? 'bg-gray-900 text-white'
                                    : 'border bg-white text-gray-900'
                                } ${isCancelled ? 'opacity-60' : ''}`}
                        >
                            <p
                                className={`mb-1 text-xs font-semibold ${isUser ? 'text-gray-300' : 'text-gray-500'
                                    }`}
                            >
                                {message.role}
                            </p>
                            {isCancelled && (
                                <p className="mb-1 text-xs text-red-500">
                                    중단된 메시지
                                </p>
                            )}
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
            <div ref={bottomRef} />
        </section>
    );
}