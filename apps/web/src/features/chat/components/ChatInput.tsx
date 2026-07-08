type ChatInputProps = {
    value: string;
    disabled: boolean;
    isAssistantStreaming: boolean;
    onChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
};

export function ChatInput({
    value,
    disabled,
    isAssistantStreaming,
    onChange,
    onSend,
    onStop,
}: ChatInputProps) {
    return (
        <footer className="shrink-0 border-t bg-white px-4 py-4 md:px-6">
            <div className="flex flex-col gap-3 sm:flex-row">
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                        }
                    }}
                    disabled={disabled}
                    className="min-h-[48px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:border-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder={
                        disabled
                            ? '먼저 채팅방을 선택하거나 응답이 끝날 때까지 기다려주세요.'
                            : '메시지를 입력하세요. Shift + Enter로 줄바꿈'
                    }
                />

                {isAssistantStreaming ? (
                    <button
                        type="button"
                        onClick={onStop}
                        className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 sm:w-auto"
                    >
                        중지
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={disabled}
                        className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 sm:w-auto"
                    >
                        전송
                    </button>
                )}
            </div>
        </footer>
    );
}