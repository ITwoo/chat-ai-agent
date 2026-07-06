import type { ChatRoomResponse } from "@repo/shared"

type ChatRoomSidebarProps = {
    rooms: ChatRoomResponse[];
    selectedRoomId?: number;
    onCreateRoom: () => void;
    onEnterRoom: (room: ChatRoomResponse) => void;
};

export function ChatRoomSidebar({
    rooms,
    selectedRoomId,
    onCreateRoom,
    onEnterRoom,
}: ChatRoomSidebarProps) {
    return (
        <aside className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">채팅방</h2>

                <button
                    onClick={onCreateRoom}
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

                {rooms.map((chatRoom) => {
                    const isSelected = selectedRoomId === chatRoom.id;

                    return (
                        <button
                            key={chatRoom.id}
                            onClick={() => onEnterRoom(chatRoom)}
                            className={`block w-full rounded-xl border px-3 py-3 text-left transition ${isSelected
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'bg-white hover:bg-gray-50'
                                }`}
                        >
                            <p className="truncate text-sm font-semibold">
                                {chatRoom.title}
                            </p>

                            <p
                                className={`mt-1 text-xs ${isSelected ? 'text-gray-300' : 'text-gray-500'
                                    }`}
                            >
                                roomId: {chatRoom.id}
                            </p>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}