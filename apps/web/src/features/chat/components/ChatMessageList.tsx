import type { ChatMessageResponse, ChatRoomResponse } from '@repo/shared';

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
    return (
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
    );
}