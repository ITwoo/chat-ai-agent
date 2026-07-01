export const Board_Status = {
  PUBLIC : 'PUBLIC',
  PRIVATE : 'PRIVATE',
} as const;

export type BoardStatus = typeof Board_Status[keyof typeof Board_Status];

export interface Board {
  id: number;
  title: string;
  description: string;
  status: BoardStatus;
  userId: number;
}

export interface BoardResponse {
  id: number;
  title: string;
  description: string;
  status: BoardStatus;
  userId: number;
}

export interface CreateBoardRequest {
  title: string;
  description: string;
}
