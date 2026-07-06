import type { ChatRoomResponse } from "@repo/shared"
import { useEffect, useRef, useState } from "react";

type ChatRoomSidebarProps = {
    rooms: ChatRoomResponse[];
    selectedRoomId?: number;
    onCreateRoom: () => void;
    onEnterRoom: (room: ChatRoomResponse) => void;
    onDeleteRoom: (room: ChatRoomResponse) => void;
    onEditRoom: (room: ChatRoomResponse) => void;
};

export function ChatRoomSidebar({
    rooms,
    selectedRoomId,
    onCreateRoom,
    onEnterRoom,
    onDeleteRoom,
    onEditRoom,
}: ChatRoomSidebarProps) {
    const [openedMenuRoomId, setOpenedMenuRoomId] = useState<number | null>(null);
    const sidebarRef = useRef<HTMLElement | null>(null);

    const toggleMenu = (roomId: number) => {
        setOpenedMenuRoomId((prev) => (prev === roomId ? null : roomId));
    };

    const closeMenu = () => {
        setOpenedMenuRoomId(null);
    };

    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            if (!sidebarRef.current) {
                return;
            }

            if (!sidebarRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <aside
            className="min-h-0 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
            ref={sidebarRef}
        >
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">채팅방</h2>

                <button
                    onClick={() => {
                        closeMenu();
                        onCreateRoom();
                    }
                    }
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
                    const isMenuOpen = openedMenuRoomId === chatRoom.id;

                    return (
                        <div
                            key={chatRoom.id}
                            className={`group flex items-center gap-2 rounded-xl border px-3 py-3 transition ${isSelected
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'bg-white hover:bg-gray-50'
                                }`}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    closeMenu();
                                    onEnterRoom(chatRoom);
                                }}
                                className="min-w-0 flex-1 text-left"
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
                            <div className="relative shrink-0">
                                <button
                                    type="button"
                                    aria-label="채팅방 메뉴 열기"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMenu(chatRoom.id);
                                    }}
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none transition ${isSelected
                                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                                        }`}
                                >
                                    ⋯
                                </button>

                                {isMenuOpen && (
                                    <div className="absolute right-0 top-fulll z-20 mt-1 w-28 overflow-hidden rounded-xl border bg-white py-1 text-sm text-gray-700 shadow-lg">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeMenu();
                                                onEditRoom(chatRoom);
                                            }}
                                            className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                                        >
                                            이름 변경
                                        </button>

                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeMenu();
                                                onDeleteRoom(chatRoom);
                                            }}
                                            className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}