import type { ChatMessageResponse, ChatRoomResponse } from '@repo/shared';
import { useEffect, useRef, useState } from 'react';

type ChatMessageListProps = {
    room: ChatRoomResponse | null;
    messages: ChatMessageResponse[];
    isAssistantStreaming: boolean;
    streamingText: string;
    isLoading: boolean;
    hasOlderMessages: boolean;
    isOlderMessagesLoading: boolean;
    onLoadOlderMessages: () => Promise<void>;
    onRetryMessage: (message: ChatMessageResponse) => void;
    isRetryDisabled: boolean;
};

type MessageContentPart =
    | {
        type: 'text';
        content: string;
    }
    | {
        type: 'code';
        content: string;
        language?: string
    };

function parseMessageContent(content: string): MessageContentPart[] {
    const parts: MessageContentPart[] = [];
    const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const [fullMatch, rawLanguage, codeContent] = match;

        const textBeforeCode = content.slice(lastIndex, match.index);

        if (textBeforeCode) {
            parts.push({
                type: 'text',
                content: textBeforeCode,
            });
        }

        const language = rawLanguage.trim();

        parts.push({
            type: 'code',
            language: language || undefined,
            content: codeContent.replace(/\n$/, ''),
        });

        lastIndex = match.index + fullMatch.length;
    }

    const remainingText = content.slice(lastIndex);

    if (remainingText) {
        parts.push({
            type: 'text',
            content: remainingText,
        });
    }

    if (parts.length === 0) {
        return [
            {
                type: 'text',
                content,
            },
        ];
    }

    return parts;
}

export function ChatMessageList({
    room,
    messages,
    isAssistantStreaming,
    streamingText,
    isLoading,
    hasOlderMessages,
    isOlderMessagesLoading,
    onLoadOlderMessages,
    onRetryMessage,
    isRetryDisabled,
}: ChatMessageListProps) {

    const bottomRef = useRef<HTMLDivElement | null>(null);
    const shouldSkipNextAutoScrollRef = useRef(false);

    const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);

    useEffect(() => {
        if(shouldSkipNextAutoScrollRef.current) {
            shouldSkipNextAutoScrollRef.current = false;
            return;
        }

        bottomRef.current?.scrollIntoView({
            behavior: 'smooth',
        });

    }, [messages, streamingText, isAssistantStreaming]);

    const handleLoadOlderMessagesClick = async () => {
        shouldSkipNextAutoScrollRef.current = true;

        try {
            await onLoadOlderMessages();
        } catch {
            shouldSkipNextAutoScrollRef.current = false;
        }
    }
    const handleCopyCode = async (code: string, codeKey: string) => {
        try {
            await navigator.clipboard.writeText(code);

            setCopiedCodeKey(codeKey);

            window.setTimeout(() => {
                setCopiedCodeKey((prev) => (prev === codeKey ? null : prev));
            }, 1500);
        } catch (error) {
            console.error('[copy code error]', error);
        }
    }

    const renderMessageContent = (message: ChatMessageResponse, isUser: boolean) => {
        const parts = parseMessageContent(message.content);

        return (
            <div className="space-y-3">
                {parts.map((part, index) => {
                    if (part.type === 'text') {
                        return (
                            <p
                                key={`${message.id}-text-${index}`}
                                className="whitespace-pre-wrap break-words text-sm leading-6"
                            >
                                {part.content}
                            </p>
                        );
                    }

                    const codeKey = `${message.id}-code-${index}`;
                    const isCopied = copiedCodeKey === codeKey;

                    return (
                        <div
                            key={codeKey}
                            className={`overflow-hidden rounded-xl border text-sm ${isUser
                                ? 'border-white/10 bg-black/30'
                                : 'border-gray-800 bg-gray-950 text-gray-100'
                                }`}
                        >
                            <div
                                className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-xs ${isUser
                                    ? 'border-white/10 text-gray-300'
                                    : 'border-gray-800 text-gray-400'
                                    }`}
                            >
                                <span className="truncate">
                                    {part.language || 'code'}
                                </span>

                                <button
                                    type="button"
                                    onClick={() => handleCopyCode(part.content, codeKey)}
                                    className={`shrink-0 font-semibold hover:underline ${isUser ? 'text-blue-200' : 'text-blue-300'
                                        }`}
                                >
                                    {isCopied ? '복사됨' : '복사'}
                                </button>
                            </div>

                            <pre className="overflow-x-auto px-3 py-3">
                                <code className="font-mono text-xs leading-6">
                                    {part.content}
                                </code>
                            </pre>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (!room) {
        return (
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 md:px-6 md:py-6">
                <div className="flex min-h-full items-center justify-center text-gray-500">
                    채팅방을 선택하면 메시지가 표시됩니다.
                </div>
            </section>
        );
    }

    if (isLoading) {
        return (
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 md:px-6 md:py-6">
                <div className="flex min-h-full items-center justify-center text-gray-500">
                    메시지를 불러오는 중...
                </div>
            </section>
        );
    }

    if (messages.length === 0 && !isAssistantStreaming) {
        return (
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 md:px-6 md:py-6">
                <div className="flex min-h-full items-center justify-center text-gray-500">
                    아직 메시지가 없습니다. 첫 메시지를 보내보세요.
                </div>
            </section>
        );
    }

    return (
        <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 px-4 py-4 md:px-6 md:py-6">
            {hasOlderMessages && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        disabled={isOlderMessagesLoading}
                        onClick={handleLoadOlderMessagesClick}
                        className="rounded-full border bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isOlderMessagesLoading
                            ? '이전 메시지 불러오는 중...'
                            : '이전 메시지 더 보기'}
                    </button>
                </div>
            )}
            {messages.map((message) => {
                const isUser = message.role === 'USER';
                const isCancelled = message.status === 'CANCELLED';
                const isFailed = message.status === 'FAILED';
                const canRetry = isUser && isFailed;

                return (
                    <div
                        key={message.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[75%] ${isUser
                                ? 'bg-gray-900 text-white'
                                : 'border bg-white text-gray-900'
                                } ${isCancelled || isFailed ? 'opacity-60' : ''}`}
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
                            {isFailed && (
                                <p className="mb-1 text-xs text-red-500">
                                    실패한 메시지
                                </p>
                            )}
                            {renderMessageContent(message, isUser)}
                            {canRetry && (
                                <button
                                    type="button"
                                    disabled={isRetryDisabled}
                                    onClick={() => onRetryMessage(message)}
                                    className="mt-2 text-xs font-semibold text-blue-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    재시도
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}

            {isAssistantStreaming && (
                <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl border bg-white px-4 py-3 text-gray-900 md:max-w-[75%]">
                        <p className="mb-1 text-xs font-semibold text-gray-500">
                            ASSISTANT
                        </p>

                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                            {streamingText || '생각 중...'}
                        </p>
                    </div>
                </div>
            )}
            <div ref={bottomRef} />
        </section>
    );
}