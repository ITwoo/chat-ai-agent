import { http } from '../../../api/http';
import type { Board, BoardResponse, CreateBoardRequest } from '@repo/shared/src/board';

export const boardApi = {
  findAll() {
    return http<BoardResponse[]>('/boards');
  },

  findOne(id: number) {
    return http<BoardResponse>(`/boards/${id}`);
  },

  create(data: CreateBoardRequest, token: string) {
    return http<Board>('/boards', {
      method: 'POST',
      body: data,
      token,
    });
  },

  remove(id: number, token: string) {
    return http<void>(`/boards/${id}`, {
      method: 'DELETE',
      token,
    });
  },
};