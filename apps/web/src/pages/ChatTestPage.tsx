import type { ChatMessageResponse, ChatRoomResponse } from "@repo/shared";
import { useEffect, useState } from "react";
import { connectChatSocket, disconnectChatSocket } from "../features/chat/chatSocket";
import { createChatRoom } from "../features/chat/chatApi";

export function ChatTestPage() {
    const [room, setRoom] = useState<ChatRoomResponse | null>(null);
    const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
    const [content, setContent] = useState('');

    useEffect(() => {
        const socket = connectChatSocket();

        socket.on('connect', () => {
            console.log('socket connected', socket.id);
        });

        socket.on('joined_room', (data) => {
            console.log('joined room', data);
        });

        socket.on('message_created', (message: ChatMessageResponse) => {
            console.log('message created', message);
            setMessages((prev) => [...prev, message]);
        });

        socket.on('chat_error', (error) =>{
            console.error('chat error', error);
            alert(error.message);
        })

        socket.on('disconnect', () => {
            console.log('socket disconnected');
        });

        return () => {
            socket.off('connect');
            socket.off('joined_room');
            socket.off('message_created');
            socket.off('chat_error');
            socket.off('disconnect');
            disconnectChatSocket();
        };
    }, []);

    const handleCreateRoom = async () => {
        const createdRoom = await createChatRoom({
            title: 'Test Room',
        });

        setRoom(createdRoom);

        const socket = connectChatSocket();

        socket.emit('join_room', { roomId: createdRoom.id });
    };

    const handleSendMessage = async () => {
        if(!room) {
            alert('먼저 채팅방을 만들어야 합니다.');
            return;
        }

        if(!content.trim()) {
            alert('메시지를 입력해주세요.');
            return;
        }

        const socket = connectChatSocket();

        socket.emit('send_message', {
            roomId: room.id,
            content: content,
        });

        setContent('');
    };

    return (
        <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold">채팅 소켓 테스트</h1>
  
        <button
          onClick={handleCreateRoom}
          className="rounded-lg bg-gray-900 px-4 py-2 text-white"
        >
          채팅방 생성 후 입장
        </button>
  
        {room && (
          <div className="mt-4 rounded-lg border bg-white p-4">
            <p className="font-semibold">현재 방</p>
            <p>roomId: {room.id}</p>
            <p>title: {room.title}</p>
          </div>
        )}
  
        <div className="mt-6 space-y-3 rounded-lg border bg-white p-4">
          {messages.map((message) => (
            <div key={message.id} className="rounded-lg bg-gray-100 p-3">
              <p className="text-sm font-semibold">{message.role}</p>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
  
        <div className="mt-6 flex gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSendMessage();
              }
            }}
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="메시지를 입력하세요"
          />
  
          <button
            onClick={handleSendMessage}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            전송
          </button>
        </div>
      </div>
    )
}           