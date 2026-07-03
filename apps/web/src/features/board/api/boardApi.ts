import { http } from '../../../api/http';
import type { Board, BoardResponse, CreateBoardRequest } from '@repo/shared/src/board';

export const boardApi = {
  findAll() {
    return http<BoardResponse[]>('/boards');
  },

  findOne(id: number) {
    return http<BoardResponse>(`/boards/${id}`);
  },

  create(data: CreateBoardRequest) {
    return http<Board>('/boards', {
      method: 'POST',
      body: data,
    });
  },

  remove(id: number) {
    return http<void>(`/boards/${id}`, {
      method: 'DELETE',
    });
  },
};