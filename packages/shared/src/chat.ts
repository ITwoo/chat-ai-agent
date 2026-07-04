export const ChatMessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;

export type ChatMessageRole =
  (typeof ChatMessageRole)[keyof typeof ChatMessageRole];

export interface ChatRoomResponse {
  id: number;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageResponse {
  id: number;
  roomId: number;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface ChatRoomDetailResponse {
  id: number;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageResponse[];
}

export interface CreateChatRoomRequest {
  title?: string;
}

export interface UpdateChatRoomRequest {
  title: string;
}

export interface CreateChatMessageRequest {
  content: string;
}