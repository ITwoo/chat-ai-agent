export const BoardStatus = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
} as const;

export type BoardStatus = (typeof BoardStatus)[keyof typeof BoardStatus];

export interface BoardResponse {
  id: number;
  title: string;
  description: string;
  status: BoardStatus;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBoardRequest {
  title: string;
  description: string;
}

export interface UpdateBoardRequest {
  title: string;
  description: string;
  status?: BoardStatus;
}